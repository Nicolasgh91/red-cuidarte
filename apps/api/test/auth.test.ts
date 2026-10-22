import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signDeviceToken } from "../src/auth/deviceToken.js";
import { TEST_ENV, createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("seguridad (F3)", () => {
  it("health no pide sesión", async () => {
    expect((await h.req("/health")).status).toBe(200);
  });

  it("sin token → 401", async () => {
    const r = await h.req("/me");
    expect(r.status).toBe(401);
  });

  it("token inválido → 401", async () => {
    const r = await h.req("/me", { headers: { Authorization: "Bearer basura" } });
    expect(r.status).toBe(401);
    expect(await code(r)).toBe("invalid_token");
  });

  it("usuario de Auth sin fila en users → 403 not_registered", async () => {
    const r = await h.req("/me", { as: randomUUID(), device: false });
    expect(r.status).toBe(403);
    expect(await code(r)).toBe("not_registered");
  });

  it("sin dispositivo registrado → 403 device_unregistered", async () => {
    const c = await h.caregiver();
    await h.sql`delete from devices where user_id = ${c}`;
    const r = await h.req("/me", { as: c });
    expect(r.status).toBe(403);
    expect(await code(r)).toBe("device_unregistered");
  });

  it("sin token de dispositivo → 403 device_login_required", async () => {
    const c = await h.caregiver();
    const r = await h.req("/me", { as: c, device: false });
    expect(r.status).toBe(403);
    expect(await code(r)).toBe("device_login_required");
  });

  it("el token de dispositivo de otra credencial no sirve (y 'Liberar' lo invalida)", async () => {
    const c = await h.caregiver();
    const stale = await signDeviceToken(TEST_ENV.DEVICE_TOKEN_SECRET, c, "otra-credencial");
    const r = await h.req("/me", { as: c, device: false, headers: { "X-Device-Token": stale } });
    expect(r.status).toBe(403);
    await h.sql`delete from devices where user_id = ${c}`; // admin libera
    expect(await code(await h.req("/me", { as: c }))).toBe("device_unregistered");
  });

  it("el token de dispositivo de otro usuario no sirve", async () => {
    const a = await h.caregiver();
    const b = await h.caregiver();
    const tokenOfB = await signDeviceToken(TEST_ENV.DEVICE_TOKEN_SECRET, b, `test-credential${b}`);
    const r = await h.req("/me", { as: a, device: false, headers: { "X-Device-Token": tokenOfB } });
    expect(r.status).toBe(403);
  });

  it("autoriza por rol en cada grupo de rutas", async () => {
    const c = await h.caregiver();
    const a = await h.admin();
    const p = await h.patient({ email: "p@example.org" });
    const matrix: [string, string, number][] = [
      [c, "/admin/summary", 403],
      [p, "/admin/summary", 403],
      [a, "/admin/summary", 200],
      [a, "/shifts?from=2026-10-01&to=2026-10-31", 403],
      [p, "/shifts?from=2026-10-01&to=2026-10-31", 403],
      [c, "/shifts?from=2026-10-01&to=2026-10-31", 200],
      [a, "/wellbeing", 403],
      [p, "/wellbeing", 403],
      [a, "/tasks?date=2026-10-21", 403],
      [a, "/reminders", 403],
      [a, "/assistant/chat", 403],
      [c, "/patient/today", 403],
      [a, "/patient/today", 403],
      [p, "/patient/today", 200],
    ];
    for (const [who, path, status] of matrix) {
      const r = await h.req(path, {
        as: who,
        method: path.startsWith("/assistant") ? "POST" : "GET",
        json: path.startsWith("/assistant") ? {} : undefined,
      });
      expect(r.status, `${path}`).toBe(status);
    }
  });

  it("CORS: acepta el origen de la web y de Capacitor, no otros", async () => {
    const ok = await h.req("/health", { headers: { Origin: "https://redasistir.online" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://redasistir.online");
    const cap = await h.req("/health", { headers: { Origin: "capacitor://localhost" } });
    expect(cap.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    const bad = await h.req("/health", { headers: { Origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("Cache-Control private, no-store en toda respuesta salvo el preflight", async () => {
    const c = await h.caregiver();
    const cases = [
      await h.req("/health"),
      await h.req("/me", { as: c }),
      await h.req("/no-existe", { as: c }),
      await h.req("/me"), // 401
    ];
    expect(cases.map((r) => r.status)).toEqual([200, 200, 404, 401]);
    for (const r of cases) expect(r.headers.get("cache-control")).toBe("private, no-store");
    const pre = await h.req("/me", {
      method: "OPTIONS",
      headers: { Origin: "https://redasistir.online", "Access-Control-Request-Method": "GET" },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("cache-control")).toBeNull();
  });
});
