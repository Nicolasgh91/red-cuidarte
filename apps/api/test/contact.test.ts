import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_ENV, createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

const send = (as: string, json: unknown) => h.req("/contact", { as, json });
const errorOf = async (r: Response) =>
  ((await r.json()) as { error: { code: string; message: string } }).error;

describe("POST /contact", () => {
  it("manda el mensaje a SMTP_FROM con Reply-To y lo registra en mail_log", async () => {
    const c = await h.caregiver({
      first_name: "Sofía",
      last_names: "Pérez",
      email: "sofia@example.org",
    });
    const r = await send(c, { subject: "Una consulta", message: "Hola, necesito ayuda.\nGracias" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({
      to: TEST_ENV.SMTP_FROM,
      replyTo: "sofia@example.org",
      subject: "[Contacto] Una consulta",
    });
    expect(h.sent[0]!.text).toContain("De: Sofía Pérez");
    expect(h.sent[0]!.text).toContain("Rol: Cuidador/a");
    expect(h.sent[0]!.text).toContain(`Usuario: ${c}`);
    expect(h.sent[0]!.text).toContain("Hola, necesito ayuda.\nGracias");

    // En mail_log queda solo la dirección y un asunto genérico (el admin lo ve en Correos).
    expect(await h.sql`select to_email, subject, kind, status from mail_log`).toEqual([
      {
        to_email: "info@redasistir.online",
        subject: "Mensaje de contacto",
        kind: "contact",
        status: "sent",
      },
    ]);
  });

  it("sin asunto manda «Sin asunto»; lo pueden usar el admin y la persona cuidada", async () => {
    const a = await h.admin();
    const p = await h.patient({ first_name: "Elena", email: "elena@example.org" });
    expect((await send(a, { message: "Del admin" })).status).toBe(200);
    expect((await send(p, { subject: "", message: "De la persona cuidada" })).status).toBe(200);
    expect(h.sent.map((m) => m.subject)).toEqual([
      "[Contacto] Sin asunto",
      "[Contacto] Sin asunto",
    ]);
    expect(h.sent[0]!.text).toContain("Rol: Administrador/a");
    expect(h.sent[1]!.text).toContain("Rol: Persona cuidada");
    expect(h.sent[1]!.replyTo).toBe("elena@example.org");
  });

  it("rechaza datos inválidos con 400 y no manda nada", async () => {
    const c = await h.caregiver();
    const cases: [unknown, string][] = [
      [{ message: "" }, "Escribí tu mensaje."],
      [{ message: "   \n " }, "Escribí tu mensaje."],
      [{}, ""],
      [{ message: "a".repeat(2001) }, "El mensaje puede tener hasta 2000 caracteres."],
      [
        { subject: "a".repeat(101), message: "hola" },
        "El asunto puede tener hasta 100 caracteres.",
      ],
    ];
    for (const [body, message] of cases) {
      const r = await send(c, body);
      expect(r.status).toBe(400);
      const e = await errorOf(r);
      expect(e.code).toBe("invalid_input");
      if (message) expect(e.message).toBe(message);
    }
    expect(h.sent).toHaveLength(0);
    expect((await send(c, { subject: "a".repeat(100), message: "a".repeat(2000) })).status).toBe(
      200,
    );
  });

  it("el asunto sale en una sola línea: sin saltos ni caracteres de control (no inyecta cabeceras)", async () => {
    const c = await h.caregiver();
    await send(c, { subject: "Hola\r\nBcc: x@evil.org\u0000\t fin", message: "m" });
    await send(c, { subject: "\r\n\u0000\t", message: "m" });
    const control = /[\p{Cc}\p{Zl}\p{Zp}]/u;
    expect(h.sent[0]!.subject).toBe("[Contacto] Hola Bcc: x@evil.org fin");
    expect(h.sent[0]!.subject).not.toMatch(control);
    expect(h.sent[1]!.subject).toBe("[Contacto] Sin asunto");
  });

  it("limita a 3 mensajes por usuario en 24 horas móviles", async () => {
    const c = await h.caregiver();
    const other = await h.caregiver();
    for (let i = 0; i < 3; i++)
      expect((await send(c, { message: `mensaje ${i}` })).status).toBe(200);

    const r = await send(c, { message: "el cuarto" });
    expect(r.status).toBe(429);
    expect(await errorOf(r)).toEqual({
      code: "rate_limited",
      message: "Ya mandaste 3 mensajes en las últimas 24 horas. Probá de nuevo más tarde.",
    });
    expect(h.sent).toHaveLength(3);

    // Otro usuario no se ve afectado.
    expect((await send(other, { message: "hola" })).status).toBe(200);

    // Al salir el más viejo de la ventana de 24 h, se puede volver a escribir.
    await h.sql`update rate_hits set at = at - interval '25 hours'
                where ctid = (select ctid from rate_hits where key = ${"contact:" + c} limit 1)`;
    expect((await send(c, { message: "ahora sí" })).status).toBe(200);
  });

  it("pedidos simultáneos tampoco pasan el límite", async () => {
    const c = await h.caregiver();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => send(c, { message: `m${i}` })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.status === 429)).toHaveLength(3);
    expect(h.sent).toHaveLength(3);
  });

  it("si el SMTP falla responde 502 y lo deja como failed en mail_log", async () => {
    const c = await h.caregiver();
    h.failMail(true);
    const r = await send(c, { subject: "Asunto privado", message: "Texto del mensaje" });
    expect(r.status).toBe(502);
    expect(await errorOf(r)).toEqual({
      code: "mail_failed",
      message: "No pudimos enviar tu mensaje ahora. Probá de nuevo en un rato.",
    });
    expect(await h.sql`select kind, status, subject from mail_log`).toEqual([
      { kind: "contact", status: "failed", subject: "Mensaje de contacto" },
    ]);
    // El fallido cuenta para el límite.
    h.failMail(false);
    await send(c, { message: "2" });
    await send(c, { message: "3" });
    expect((await send(c, { message: "4" })).status).toBe(429);
  });

  it("no loguea el contenido del mensaje", async () => {
    const c = await h.caregiver();
    const spies = (["log", "info", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    h.failMail(true);
    await send(c, { subject: "SECRETO-ASUNTO", message: "SECRETO-MENSAJE" });
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    spies.forEach((s) => s.mockRestore());
    expect(logged).not.toContain("SECRETO");
  });

  it("sin sesión responde 401; con JWT pero sin token de dispositivo, 403", async () => {
    const c = await h.caregiver();
    const r = await h.req("/contact", { json: { message: "hola" } });
    expect(r.status).toBe(401);
    const r2 = await h.req("/contact", { as: c, device: false, json: { message: "hola" } });
    expect(r2.status).toBe(403);
    expect(h.sent).toHaveLength(0);
    expect(await h.sql`select 1 from rate_hits`).toHaveLength(0);
  });
});
