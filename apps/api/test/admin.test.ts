import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

const newCg = (over: object = {}) => ({
  first_name: "Marta",
  last_names: "Ejemplo",
  phone: "342 155 222222",
  email: "Marta@Ejemplo.org",
  birth_date: "1975-10-22",
  patient_ids: [] as string[],
  ...over,
});

describe("admin: cuidadores", () => {
  it("da de alta un cuidador/a: crea el usuario de Auth, la ficha y las asignaciones", async () => {
    const a = await h.admin();
    const p = await h.patient();
    const r = await h.req("/admin/caregivers", { as: a, json: newCg({ patient_ids: [p] }) });
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    expect(h.authCreated).toEqual(["marta@ejemplo.org"]);
    expect(
      await h.sql`select 1 from users where id = ${id} and role = 'caregiver' and email = 'marta@ejemplo.org'`,
    ).toHaveLength(1);
    const list = (await (await h.req("/admin/caregivers", { as: a })).json()) as {
      caregivers: { id: string; patient_ids: string[]; birth_date: string }[];
    };
    expect(list.caregivers.find((c) => c.id === id)).toMatchObject({
      patient_ids: [p],
      birth_date: "1975-10-22",
    });
  });

  it("rechaza mails repetidos, pacientes inexistentes y datos inválidos", async () => {
    const a = await h.admin();
    await h.caregiver({ email: "marta@ejemplo.org" });
    expect((await h.req("/admin/caregivers", { as: a, json: newCg() })).status).toBe(409);
    expect(
      (
        await h.req("/admin/caregivers", {
          as: a,
          json: newCg({
            email: "otra@ejemplo.org",
            patient_ids: ["00000000-0000-4000-8000-000000000000"],
          }),
        })
      ).status,
    ).toBe(409);
    expect(
      (await h.req("/admin/caregivers", { as: a, json: newCg({ email: "mal" }) })).status,
    ).toBe(400);
    expect(
      (await h.req("/admin/caregivers", { as: a, json: newCg({ phone: "0342" }) })).status,
    ).toBe(400);
    expect(h.authCreated).toEqual([]);
  });

  it("si falla la base, borra el usuario de Auth que acababa de crear", async () => {
    const a = await h.admin();
    await h.sql`alter table caregivers add constraint boom check (first_name <> 'Boom')`;
    try {
      const r = await h.req("/admin/caregivers", { as: a, json: newCg({ first_name: "Boom" }) });
      expect(r.status).toBe(500);
      expect(h.authCreated).toHaveLength(1);
      expect(h.authDeleted).toHaveLength(1);
      expect(await h.sql`select 1 from users where email = 'marta@ejemplo.org'`).toHaveLength(0);
    } finally {
      await h.sql`alter table caregivers drop constraint boom`;
    }
  });

  it("asigna y reasigna pacientes", async () => {
    const a = await h.admin();
    const c = await h.caregiver();
    const p1 = await h.patient();
    const p2 = await h.patient();
    expect(
      (
        await h.req(`/admin/caregivers/${c}/patients`, {
          as: a,
          method: "PUT",
          json: { patient_ids: [p1, p2] },
        })
      ).status,
    ).toBe(200);
    expect(await h.sql`select 1 from caregiver_patients where caregiver_id = ${c}`).toHaveLength(2);
    await h.req(`/admin/caregivers/${c}/patients`, {
      as: a,
      method: "PUT",
      json: { patient_ids: [p2] },
    });
    expect(
      (
        await h.sql<
          { patient_id: string }[]
        >`select patient_id from caregiver_patients where caregiver_id = ${c}`
      ).map((r) => r.patient_id),
    ).toEqual([p2]);
    expect(
      (
        await h.req(`/admin/caregivers/${p1}/patients`, {
          as: a,
          method: "PUT",
          json: { patient_ids: [] },
        })
      ).status,
    ).toBe(404);
  });

  it("el cuidador no puede usar estas rutas", async () => {
    const c = await h.caregiver();
    for (const [path, method] of [
      ["/admin/caregivers", "GET"],
      ["/admin/caregivers", "POST"],
      ["/admin/patients", "GET"],
      ["/admin/devices", "GET"],
      ["/admin/mail/test", "POST"],
    ] as const) {
      expect(
        (await h.req(path, { as: c, method, json: method === "POST" ? {} : undefined })).status,
        path,
      ).toBe(403);
    }
  });
});

describe("admin: personas cuidadas y medicación", () => {
  it("da de alta una persona sin mail (solo ficha) y otra con mail (con ingreso)", async () => {
    const a = await h.admin();
    const r1 = await h.req("/admin/patients", {
      as: a,
      json: { first_name: "Raúl", last_name: "Ejemplo" },
    });
    expect(r1.status).toBe(201);
    expect(h.authCreated).toEqual([]);
    const r2 = await h.req("/admin/patients", {
      as: a,
      json: { first_name: "Ana", last_name: "Ejemplo", email: "ana@ejemplo.org" },
    });
    expect(r2.status).toBe(201);
    expect(h.authCreated).toEqual(["ana@ejemplo.org"]);
    const { patients } = (await (await h.req("/admin/patients", { as: a })).json()) as {
      patients: { first_name: string; has_login: boolean }[];
    };
    expect(patients.map((p) => [p.first_name, p.has_login])).toEqual([
      ["Ana", true],
      ["Raúl", false],
    ]);
  });

  it("carga y baja medicación; el admin la ve descifrada y ordenada", async () => {
    const a = await h.admin();
    const p = await h.patient();
    const r = await h.req(`/admin/patients/${p}/medications`, {
      as: a,
      json: { name: "Metformina", dose: "500 mg", times: ["20:00", "08:00", "08:00"] },
    });
    expect(r.status).toBe(201);
    const med = (await r.json()) as { id: string; times: string[] };
    expect(med.times).toEqual(["08:00", "20:00"]);
    const { patients } = (await (await h.req("/admin/patients", { as: a })).json()) as {
      patients: { medications: { name: string; dose: string }[] }[];
    };
    expect(patients[0]!.medications).toEqual([
      expect.objectContaining({ name: "Metformina", dose: "500 mg" }),
    ]);
    expect((await h.req(`/admin/medications/${med.id}`, { as: a, method: "DELETE" })).status).toBe(
      200,
    );
    expect((await h.req(`/admin/medications/${med.id}`, { as: a, method: "DELETE" })).status).toBe(
      404,
    );
  });

  it("valida la medicación", async () => {
    const a = await h.admin();
    const p = await h.patient();
    const post = (j: object) => h.req(`/admin/patients/${p}/medications`, { as: a, json: j });
    expect((await post({ name: "", dose: "10 mg", times: ["08:00"] })).status).toBe(400);
    expect((await post({ name: "X", dose: "10 mg", times: [] })).status).toBe(400);
    expect((await post({ name: "X", dose: "10 mg", times: ["8:00"] })).status).toBe(400);
    expect(
      (
        await h.req("/admin/patients/00000000-0000-4000-8000-000000000000/medications", {
          as: a,
          json: { name: "X", dose: "1", times: ["08:00"] },
        })
      ).status,
    ).toBe(404);
  });
});

describe("admin: panel", () => {
  it("resume cuidadores, pacientes, turnos de la semana, bloqueos y próximo cumpleaños", async () => {
    const a = await h.admin();
    const c = await h.caregiver({ first_name: "Marta", birth_date: "1975-10-25" });
    const p = await h.patient();
    await h.shift(c, p, "2026-10-19", "08:00", "14:00"); // esta semana (lunes 19)
    await h.shift(c, p, "2026-10-26", "08:00", "14:00"); // la que viene
    await h.sql`insert into device_attempts (user_id, label) values (${c}, 'Chrome · Windows')`;
    expect(await (await h.req("/admin/summary", { as: a })).json()).toMatchObject({
      caregivers: 1,
      patients: 1,
      shifts_this_week: 1,
      blocked_attempts: 1,
      next_birthday: { first_name: "Marta", date: "2026-10-25", days: 4 },
    });
  });

  it("lista a los administradores", async () => {
    const a = await h.admin();
    const { admins } = (await (await h.req("/admin/admins", { as: a })).json()) as {
      admins: { first_name: string }[];
    };
    expect(admins.map((x) => x.first_name)).toEqual(["Jorge"]);
  });
});

describe("admin: dispositivos", () => {
  it("lista el estado y el último intento bloqueado, y no incluye fichas sin ingreso", async () => {
    const a = await h.admin();
    const c = await h.caregiver({ first_name: "Marta" });
    await h.patient(); // sin mail: no entra
    await h.sql`insert into device_attempts (user_id, label, ip) values (${c}, 'Chrome · Windows', '203.0.113.5')`;
    const { devices } = (await (await h.req("/admin/devices", { as: a })).json()) as {
      devices: {
        id: string;
        name: string;
        label: string | null;
        blocked: { label: string; ip: string } | null;
      }[];
    };
    expect(devices.map((d) => d.name).sort()).toEqual(["Jorge Ejemplo", "Marta Ejemplo"]);
    expect(devices.find((d) => d.id === c)).toMatchObject({
      label: "Test",
      blocked: { label: "Chrome · Windows", ip: "203.0.113.5" },
    });
  });

  it("liberar borra el dispositivo; a partir de ahí la cuenta pide registrar uno", async () => {
    const a = await h.admin();
    const c = await h.caregiver();
    expect((await h.req(`/admin/devices/${c}/release`, { as: a, method: "POST" })).status).toBe(
      200,
    );
    expect((await h.req(`/admin/devices/${c}/release`, { as: a, method: "POST" })).status).toBe(
      404,
    );
    const r = await h.req("/me", { as: c });
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      "device_unregistered",
    );
  });

  it("autorizar marca el intento y descarta los otros bloqueos; sin intento da 404", async () => {
    const a = await h.admin();
    const c = await h.caregiver();
    expect((await h.req(`/admin/devices/${c}/authorize`, { as: a, method: "POST" })).status).toBe(
      404,
    );
    await h.sql`insert into device_attempts (user_id, label, at) values (${c}, 'Viejo', now() - interval '1 hour'), (${c}, 'Nuevo', now())`;
    expect((await h.req(`/admin/devices/${c}/authorize`, { as: a, method: "POST" })).status).toBe(
      200,
    );
    expect(
      await h.sql<
        { label: string; status: string }[]
      >`select label, status from device_attempts where user_id = ${c}`,
    ).toEqual([{ label: "Nuevo", status: "authorized" }]);
  });
});

describe("admin: correo de prueba (F6)", () => {
  it("manda el mail y lo registra en mail_log; se puede repetir", async () => {
    const a = await h.admin();
    for (let i = 0; i < 2; i++) {
      const r = await h.req("/admin/mail/test", { as: a, json: { to: "Nico@Example.org" } });
      expect(await r.json()).toEqual({ status: "sent" });
    }
    expect(h.sent).toHaveLength(2);
    expect(h.sent[0]).toMatchObject({ to: "nico@example.org", subject: "Prueba de Cuidarte+" });
    const { log } = (await (await h.req("/admin/mail/log", { as: a })).json()) as {
      log: { kind: string; status: string }[];
    };
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ kind: "test", status: "sent" });
  });

  it("si el SMTP falla, queda registrado como fallido con el error", async () => {
    const a = await h.admin();
    h.failMail(true);
    expect(
      await (await h.req("/admin/mail/test", { as: a, json: { to: "x@example.org" } })).json(),
    ).toEqual({ status: "failed" });
    expect(await h.sql`select status, error from mail_log`).toEqual([
      { status: "failed", error: "SMTP caído" },
    ]);
  });
});
