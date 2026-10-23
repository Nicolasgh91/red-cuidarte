import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createSql, type Sql } from "../src/db.js";
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

describe("conexión por pedido (Vercel)", () => {
  const trackingFactory = (inner?: () => Sql) => {
    const clients: Sql[] = [];
    let ended = 0;
    const create = inner ?? (() => createSql(TEST_ENV.DATABASE_URL, { quiet: true }));
    const sqlPerRequest = () => {
      const sql = create();
      const origEnd = sql.end.bind(sql);
      sql.end = ((opts?: Parameters<Sql["end"]>[0]) => {
        ended++;
        return origEnd(opts);
      }) as Sql["end"];
      clients.push(sql);
      return sql;
    };
    return { sqlPerRequest, clients, ended: () => ended };
  };

  it("cada pedido crea y cierra su propio cliente", async () => {
    const t = trackingFactory();
    const app = createApp({ ...h.deps, sqlPerRequest: t.sqlPerRequest });
    const a = await h.admin();
    for (const path of ["/demo/users", "/me", "/admin/summary"]) {
      const r = await app.request(path, { headers: { Authorization: `Bearer demo:${a}` } });
      expect(r.status).toBe(200);
    }
    expect(t.clients).toHaveLength(3);
    expect(t.ended()).toBe(3);
    expect(new Set(t.clients).size).toBe(3);
  });

  it("un pedido colgado no bloquea a otro", async () => {
    let calls = 0;
    const t = trackingFactory(() => {
      calls++;
      if (calls === 1) {
        return Object.assign(() => new Promise<never>(() => {}), {
          end: async () => {},
        }) as unknown as Sql;
      }
      return createSql(TEST_ENV.DATABASE_URL, { quiet: true });
    });
    const app = createApp({ ...h.deps, sqlPerRequest: t.sqlPerRequest });
    const a = await h.admin();
    const headers = { Authorization: `Bearer demo:${a}` };
    void app.request("/me", { headers });
    const r = await Promise.race([
      app.request("/demo/users", { headers }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("pedido B bloqueado por A")), 3_000),
      ),
    ]);
    expect(r.status).toBe(200);
    expect(t.clients).toHaveLength(2);
    expect(t.clients[0]).not.toBe(t.clients[1]);
  });

  it("cierra el cliente cuando el pedido falla", async () => {
    const t = trackingFactory();
    const app = createApp({ ...h.deps, sqlPerRequest: t.sqlPerRequest });
    const r = await app.request("/me", {
      headers: { Authorization: `Bearer demo:${randomUUID()}` },
    });
    expect(r.status).toBe(403);
    expect(t.clients).toHaveLength(1);
    expect(t.ended()).toBe(1);
  });
});
