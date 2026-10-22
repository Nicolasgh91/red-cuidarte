import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

describe("perfil y pacientes asignados", () => {
  it("GET /me devuelve el rol y el perfil de cada tipo de usuario", async () => {
    const c = await h.caregiver({ first_name: "Sofía" });
    const a = await h.admin();
    const p = await h.patient({ first_name: "Elena", email: "elena@example.org" });
    expect(await (await h.req("/me", { as: c })).json()).toMatchObject({
      role: "caregiver",
      profile: { first_name: "Sofía" },
    });
    expect(await (await h.req("/me", { as: a })).json()).toMatchObject({
      role: "admin",
      profile: { first_name: "Jorge" },
    });
    expect(await (await h.req("/me", { as: p })).json()).toMatchObject({
      role: "patient",
      profile: { first_name: "Elena" },
    });
  });

  it("PUT /me/profile actualiza los datos y valida el formato", async () => {
    const c = await h.caregiver();
    const body = {
      first_name: "Sofi",
      last_names: "Pérez Gómez",
      phone: "342 155 123456",
      email: "SOFI@Example.org",
      birth_date: "1980-05-14",
    };
    expect((await h.req("/me/profile", { as: c, method: "PUT", json: body })).status).toBe(200);
    const [row] = await h.sql`select first_name, email from caregivers where user_id = ${c}`;
    expect(row).toMatchObject({ first_name: "Sofi", email: "sofi@example.org" });
    expect(
      (await h.req("/me/profile", { as: c, method: "PUT", json: { ...body, phone: "123" } }))
        .status,
    ).toBe(400);
    expect(
      (
        await h.req("/me/profile", {
          as: c,
          method: "PUT",
          json: { ...body, birth_date: "1980-02-31" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await h.req("/me/profile", {
          as: c,
          method: "PUT",
          json: { ...body, birth_date: "2999-01-01" },
        })
      ).status,
    ).toBe(400);
  });

  it("PUT /me/profile no deja usar el mail de otra cuenta", async () => {
    const c = await h.caregiver();
    await h.caregiver({ email: "otra@example.org" });
    const r = await h.req("/me/profile", {
      as: c,
      method: "PUT",
      json: {
        first_name: "A",
        last_names: "B",
        phone: "342 155 123456",
        email: "otra@example.org",
        birth_date: "1980-05-14",
      },
    });
    expect(r.status).toBe(409);
  });

  it("GET /me/patients muestra solo los asignados, con su medicación descifrada", async () => {
    const c = await h.caregiver();
    const elena = await h.patient({ first_name: "Elena" });
    const raul = await h.patient({ first_name: "Raúl" });
    await h.assign(c, elena);
    await h.medication(elena, "Enalapril", "10 mg", ["08:00"]);
    await h.medication(raul, "Levotiroxina", "50 mcg", ["07:00"]);
    const body = (await (await h.req("/me/patients", { as: c })).json()) as {
      patients: { first_name: string; medications: { name: string; times: string[] }[] }[];
    };
    expect(body.patients.map((p) => p.first_name)).toEqual(["Elena"]);
    expect(body.patients[0]!.medications).toEqual([
      expect.objectContaining({ name: "Enalapril", dose: "10 mg", times: ["08:00"] }),
    ]);
    expect(JSON.stringify(body)).not.toContain("Levotiroxina");
  });

  it("la medicación se guarda cifrada en la base", async () => {
    const p = await h.patient();
    await h.medication(p, "Enalapril", "10 mg", ["08:00"]);
    const [row] = await h.sql<{ name: Buffer }[]>`select name from medications`;
    expect(row!.name.toString("utf8")).not.toContain("Enalapril");
    expect(row!.name.length).toBeGreaterThan(28);
  });

  it("DELETE /me borra la cuenta, los datos y el usuario de Auth", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.shift(c, p, "2026-10-21", "08:00", "10:00");
    await h.sql`insert into wellbeing_records (caregiver_id, mood, energy, stress) values (${c}, 1, 2, 3)`;
    const r = await h.req("/me", { as: c, method: "DELETE" });
    expect(r.status).toBe(200);
    expect(h.authDeleted).toEqual([c]);
    expect(await h.sql`select 1 from shifts`).toHaveLength(0);
    expect(await h.sql`select 1 from wellbeing_records`).toHaveLength(0);
    expect(await h.sql`select 1 from users where id = ${c}`).toHaveLength(0);
    expect(await h.sql`select 1 from patients where user_id = ${p}`).toHaveLength(1);
  });

  it("un admin no puede borrarse con DELETE /me", async () => {
    const a = await h.admin();
    expect((await h.req("/me", { as: a, method: "DELETE" })).status).toBe(403);
  });
});
