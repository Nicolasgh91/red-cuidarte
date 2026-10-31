import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SIGNUP_LIMIT } from "../src/routes/signup.js";
import { TEST_ENV, createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(async () => {
  await h.reset();
  h.deps.env = TEST_ENV;
});
afterAll(() => h.close());

const body = (over: object = {}) => ({
  role: "caregiver",
  first_name: "Marta",
  last_names: "Ejemplo",
  phone: "342 155 222222",
  email: "Marta@Ejemplo.org",
  birth_date: "1975-10-22",
  password: "una-clave-larga",
  ...over,
});

const patientBody = (over: object = {}) => ({
  role: "patient",
  first_name: "Pedro",
  last_name: "Ejemplo",
  email: "Pedro@Ejemplo.org",
  password: "una-clave-larga",
  ...over,
});

const signup = (json: unknown, ip = "200.1.1.1") =>
  h.req("/signup", { json, headers: { "x-forwarded-for": ip } });

const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("autorregistro", () => {
  it("crea la cuenta de cuidador/a con contraseña y sin pacientes", async () => {
    const r = await signup(body());
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    expect(h.authCreated).toEqual(["marta@ejemplo.org"]);
    expect(h.authPasswords).toEqual(["una-clave-larga"]);
    expect(
      await h.sql`select 1 from users where id = ${id} and role = 'caregiver' and email = 'marta@ejemplo.org'`,
    ).toHaveLength(1);
    expect(await h.sql`select 1 from caregivers where user_id = ${id}`).toHaveLength(1);
    expect(await h.sql`select 1 from caregiver_patients where caregiver_id = ${id}`).toHaveLength(
      0,
    );
  });

  it("es pública: no pide sesión ni dispositivo", async () => {
    const r = await h.app.request("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body()),
    });
    expect(r.status).toBe(201);
  });

  it("rechaza mails repetidos y datos inválidos", async () => {
    await h.caregiver({ email: "marta@ejemplo.org" });
    const dup = await signup(body());
    expect(dup.status).toBe(409);
    expect(await code(dup)).toBe("email_taken");

    const short = await signup(body({ email: "otra@ejemplo.org", password: "corta" }));
    expect(short.status).toBe(400);
    expect(await code(short)).toBe("invalid_input");
    expect((await signup(body({ email: "no-es-mail" }))).status).toBe(400);
    expect((await signup(body({ email: "x@ejemplo.org", phone: "015" }))).status).toBe(400);
    expect(h.authCreated).toEqual([]);
  });

  it("no acepta pacientes en el cuerpo", async () => {
    const p = await h.patient();
    const r = await signup(body({ patient_ids: [p] }));
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    expect(await h.sql`select 1 from caregiver_patients where caregiver_id = ${id}`).toHaveLength(
      0,
    );
  });

  it("limita los registros por IP", async () => {
    for (let i = 0; i < SIGNUP_LIMIT; i++) {
      expect((await signup(body({ email: `cg${i}@ejemplo.org` }))).status).toBe(201);
    }
    const over = await signup(body({ email: "una-mas@ejemplo.org" }));
    expect(over.status).toBe(429);
    expect(await code(over)).toBe("rate_limited");
    expect((await signup(body({ email: "otra-ip@ejemplo.org" }), "200.2.2.2")).status).toBe(201);
  });

  it("crea la cuenta de paciente con contraseña y sin cuidadores", async () => {
    const r = await signup(patientBody());
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    expect(h.authCreated).toEqual(["pedro@ejemplo.org"]);
    expect(h.authPasswords).toEqual(["una-clave-larga"]);
    expect(
      await h.sql`select 1 from users where id = ${id} and role = 'patient' and email = 'pedro@ejemplo.org'`,
    ).toHaveLength(1);
    expect(
      await h.sql`select 1 from patients where user_id = ${id} and first_name = 'Pedro' and last_name = 'Ejemplo'`,
    ).toHaveLength(1);
    expect(await h.sql`select 1 from caregiver_patients where patient_id = ${id}`).toHaveLength(0);
  });

  it("el paciente necesita mail y contraseña válidos y no puede repetir mail", async () => {
    expect((await signup(patientBody({ email: undefined }))).status).toBe(400);
    expect((await signup(patientBody({ password: "corta" }))).status).toBe(400);
    await h.caregiver({ email: "pedro@ejemplo.org" });
    const dup = await signup(patientBody());
    expect(dup.status).toBe(409);
    expect(await code(dup)).toBe("email_taken");
  });

  it("solo se puede elegir cuidador/a o paciente", async () => {
    for (const role of ["admin", undefined, "otro"]) {
      const r = await signup(body({ role }));
      expect(r.status).toBe(400);
      expect(await code(r)).toBe("invalid_input");
    }
    expect(h.authCreated).toEqual([]);
    expect(await h.sql`select 1 from users where role = 'admin'`).toHaveLength(0);
  });
});
