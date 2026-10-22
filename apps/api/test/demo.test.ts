import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_ENV, createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(async () => {
  await h.reset();
  h.deps.env = { ...TEST_ENV, DEMO_MODE: true };
});
afterAll(() => h.close());

const as = (id: string, path: string, opts: { method?: string; json?: unknown } = {}) =>
  h.req(path, { ...opts, headers: { Authorization: `Bearer demo:${id}` } });

const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("modo demo", () => {
  it("sin DEMO_MODE no hay selector ni ingreso demo", async () => {
    h.deps.env = TEST_ENV;
    const a = await h.admin();
    expect((await h.req("/demo/users")).status).toBe(404);
    expect((await as(a, "/me")).status).toBe(401);
  });

  it("lista los usuarios reales de la base, por rol", async () => {
    const p = await h.patient({ first_name: "Elena", last_name: "Paz", email: null });
    const c = await h.caregiver({ first_name: "Carla", last_names: "Gómez" });
    const a = await h.admin();
    const r = await h.req("/demo/users");
    expect(r.status).toBe(200);
    const { users } = (await r.json()) as { users: { id: string; role: string; name: string }[] };
    expect(users.map((u) => [u.id, u.role, u.name])).toEqual([
      [a, "admin", "Jorge Ejemplo"],
      [c, "caregiver", "Carla Gómez"],
      [p, "patient", "Elena Paz"],
    ]);
  });

  it("entra como cada usuario sin passkey y los cambios quedan en la base", async () => {
    const p = await h.patient();
    const c = await h.caregiver();
    const a = await h.admin();
    await h.assign(c, p);
    await h.sql`delete from devices`; // sin dispositivo registrado igual entra
    for (const [id, role] of [
      [a, "admin"],
      [c, "caregiver"],
      [p, "patient"],
    ] as const) {
      const r = await as(id, "/me");
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ id, role });
    }
    const profile = {
      first_name: "Carla",
      last_names: "Demo",
      phone: "1150000002",
      email: "carla@demo.test",
      birth_date: "1990-01-02",
    };
    expect((await as(c, "/me/profile", { method: "PUT", json: profile })).status).toBe(200);
    const [row] = await h.sql`select last_names from caregivers where user_id = ${c}`;
    expect(row!.last_names).toBe("Demo");
  });

  it("usuario inexistente → 403 not_registered; respeta los roles", async () => {
    const r = await as(randomUUID(), "/me");
    expect(r.status).toBe(403);
    expect(await code(r)).toBe("not_registered");
    const c = await h.caregiver();
    expect((await as(c, "/admin/summary")).status).toBe(403);
    expect((await h.req("/me", { headers: { Authorization: "Bearer demo:basura" } })).status).toBe(
      401,
    );
  });
});
