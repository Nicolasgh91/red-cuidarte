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

  it("POST /me/patients crea la ficha y la asigna a quien la crea, sin mail", async () => {
    const c = await h.caregiver();
    const other = await h.caregiver();
    const r = await h.req("/me/patients", {
      as: c,
      json: { first_name: " Elena ", last_name: "Ríos" },
    });
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    expect(h.authCreated).toEqual([]);
    expect(
      await h.sql`select 1 from users where id = ${id} and role = 'patient' and email is null`,
    ).toHaveLength(1);
    expect(
      await h.sql`select 1 from patients where user_id = ${id} and first_name = 'Elena'`,
    ).toHaveLength(1);
    expect(
      await h.sql`select caregiver_id from caregiver_patients where patient_id = ${id}`,
    ).toEqual([{ caregiver_id: c }]);
    const mine = (await (await h.req("/me/patients", { as: c })).json()) as {
      patients: { id: string }[];
    };
    expect(mine.patients.map((p) => p.id)).toEqual([id]);
    expect(
      ((await (await h.req("/me/patients", { as: other })).json()) as { patients: unknown[] })
        .patients,
    ).toEqual([]);
  });

  it("POST /me/patients con mail crea la cuenta de Auth; no repite mails y valida", async () => {
    const c = await h.caregiver();
    const ok = await h.req("/me/patients", {
      as: c,
      json: { first_name: "Raúl", last_name: "Paz", email: "Raul@Example.org" },
    });
    expect(ok.status).toBe(201);
    expect(h.authCreated).toEqual(["raul@example.org"]);
    expect(h.authPasswords).toEqual([undefined]);

    const dup = await h.req("/me/patients", {
      as: c,
      json: { first_name: "Otro", last_name: "Paz", email: "raul@example.org" },
    });
    expect(dup.status).toBe(409);
    expect(
      (await h.req("/me/patients", { as: c, json: { first_name: "", last_name: "Paz" } })).status,
    ).toBe(400);
    expect(await h.sql`select 1 from caregiver_patients where caregiver_id = ${c}`).toHaveLength(1);
  });

  it("POST /me/patients es solo para cuidadores y no deja datos si falla", async () => {
    const p = await h.patient({ email: "p@example.org" });
    const a = await h.admin();
    const json = { first_name: "Ana", last_name: "Gil" };
    expect((await h.req("/me/patients", { as: p, json })).status).toBe(403);
    expect((await h.req("/me/patients", { as: a, json })).status).toBe(403);
    expect((await h.req("/me/patients", { json })).status).toBe(401);
    expect(await h.sql`select 1 from patients where first_name = 'Ana'`).toHaveLength(0);
  });

  it("el cuidador carga y quita medicación de sus pacientes, y la ve en /me/patients", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.assign(c, p);
    const r = await h.req(`/me/patients/${p}/medications`, {
      as: c,
      json: { name: "Enalapril", dose: "10 mg", times: ["20:00", "08:00"] },
    });
    expect(r.status).toBe(201);
    const med = (await r.json()) as { id: string };
    const list = (await (await h.req("/me/patients", { as: c })).json()) as {
      patients: { medications: { name: string; times: string[] }[] }[];
    };
    expect(list.patients[0]!.medications).toEqual([
      expect.objectContaining({ name: "Enalapril", times: ["08:00", "20:00"] }),
    ]);
    expect((await h.req(`/me/medications/${med.id}`, { as: c, method: "DELETE" })).status).toBe(
      200,
    );
    expect((await h.req(`/me/medications/${med.id}`, { as: c, method: "DELETE" })).status).toBe(
      404,
    );
  });

  it("no se puede tocar la medicación de pacientes ajenos ni entrando sin ser cuidador", async () => {
    const c = await h.caregiver();
    const other = await h.caregiver();
    const p = await h.patient();
    await h.assign(other, p);
    const med = await h.medication(p, "Aspirina", "100 mg", ["09:00"]);
    const json = { name: "X", dose: "1", times: ["08:00"] };
    expect((await h.req(`/me/patients/${p}/medications`, { as: c, json })).status).toBe(404);
    expect((await h.req(`/me/medications/${med}`, { as: c, method: "DELETE" })).status).toBe(404);
    expect(await h.sql`select 1 from medications where patient_id = ${p}`).toHaveLength(1);
    const a = await h.admin();
    expect((await h.req(`/me/patients/${p}/medications`, { as: a, json })).status).toBe(403);
    expect((await h.req(`/me/patients/${p}/medications`, { as: p, json })).status).toBe(403);
    expect((await h.req(`/me/patients/${other}/medications`, { as: other, json: {} })).status).toBe(
      400,
    );
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
