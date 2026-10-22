import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_ENV, createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

const run = (secret: string | null = TEST_ENV.CRON_SECRET) =>
  h.req("/internal/jobs/daily", { headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
// 12:00 UTC = 09:00 en Argentina, la hora a la que dispara el cron de Vercel
const at = (iso: string) => h.setNow(new Date(iso));

describe("tarea diaria (F7)", () => {
  it("exige el secreto del cron", async () => {
    expect((await run(null)).status).toBe(403);
    expect((await run("incorrecto")).status).toBe(403);
    expect((await run()).status).toBe(200);
  });

  it("manda el saludo a quien cumple hoy y lo deja en mail_log", async () => {
    await h.caregiver({
      first_name: "Marta",
      email: "marta@ejemplo.org",
      birth_date: "1975-10-22",
    });
    await h.caregiver({ first_name: "Luis", email: "luis@ejemplo.org", birth_date: "1990-11-03" });
    at("2026-10-22T12:00:00Z");
    expect(await (await run()).json()).toMatchObject({
      date: "2026-10-22",
      birthdays: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    expect(h.sent).toEqual([
      expect.objectContaining({ to: "marta@ejemplo.org", subject: "¡Feliz cumpleaños, Marta!" }),
    ]);
    expect(await h.sql`select to_email, kind, year, status from mail_log`).toEqual([
      { to_email: "marta@ejemplo.org", kind: "birthday", year: 2026, status: "sent" },
    ]);
  });

  it("es idempotente: ejecutarla dos veces el mismo día no repite el mail", async () => {
    await h.caregiver({ email: "marta@ejemplo.org", birth_date: "1975-10-22" });
    at("2026-10-22T12:00:00Z");
    await run();
    expect(await (await run()).json()).toMatchObject({ sent: 0, skipped: 1 });
    expect(h.sent).toHaveLength(1);
  });

  it("el año siguiente vuelve a saludar", async () => {
    await h.caregiver({ email: "marta@ejemplo.org", birth_date: "1975-10-22" });
    at("2026-10-22T12:00:00Z");
    await run();
    at("2027-10-22T12:00:00Z");
    expect(await (await run()).json()).toMatchObject({ sent: 1 });
    expect(h.sent).toHaveLength(2);
  });

  it("si el SMTP falla queda registrado y la próxima ejecución lo reintenta", async () => {
    await h.caregiver({ email: "marta@ejemplo.org", birth_date: "1975-10-22" });
    at("2026-10-22T12:00:00Z");
    h.failMail(true);
    expect(await (await run()).json()).toMatchObject({ sent: 0, failed: 1 });
    expect(await h.sql`select status, error from mail_log`).toEqual([
      { status: "failed", error: "SMTP caído" },
    ]);
    h.failMail(false);
    expect(await (await run()).json()).toMatchObject({ sent: 1, failed: 0 });
    expect(await h.sql`select status, error from mail_log`).toEqual([
      { status: "sent", error: null },
    ]);
    expect(h.sent).toHaveLength(1);
  });

  it("usa la fecha de Argentina, no la de UTC", async () => {
    await h.caregiver({ email: "marta@ejemplo.org", birth_date: "1975-10-22" });
    at("2026-10-23T01:00:00Z"); // 22:00 del 22/10 en Argentina
    expect(await (await run()).json()).toMatchObject({ date: "2026-10-22", sent: 1 });
  });

  it("quien nació un 29/2 se saluda el 28/2 en años no bisiestos", async () => {
    await h.caregiver({ email: "bis@ejemplo.org", birth_date: "1980-02-29" });
    at("2027-02-28T12:00:00Z");
    expect(await (await run()).json()).toMatchObject({ sent: 1 });
    h.sent.length = 0;
    at("2028-02-28T12:00:00Z"); // 2028 es bisiesto: se espera al 29
    expect(await (await run()).json()).toMatchObject({ birthdays: 0, sent: 0 });
  });

  it("hace una consulta mínima a la base aunque no haya cumpleaños (keepalive de Supabase)", async () => {
    at("2026-10-22T12:00:00Z");
    expect(await (await run()).json()).toMatchObject({ birthdays: 0, sent: 0 });
  });
});
