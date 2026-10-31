import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LINK_ATTEMPT_LIMIT, LINK_CODE_HOURS } from "../src/services/linkCode.js";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

const getCode = async (patient: string, method = "GET") =>
  (await (await h.req("/patient/link-code", { as: patient, method })).json()) as {
    code: string;
    expires_at: string;
  };
const redeem = (caregiver: string, code: string) =>
  h.req("/me/patients/link", { as: caregiver, json: { code } });
const mine = async (caregiver: string) =>
  (
    (await (await h.req("/me/patients", { as: caregiver })).json()) as {
      patients: { id: string }[];
    }
  ).patients.map((p) => p.id);

describe("vincular paciente y cuidador con un código", () => {
  it("el paciente obtiene un código estable, y puede pedir uno nuevo", async () => {
    const p = await h.patient({ email: "p@example.org" });
    const first = await getCode(p);
    expect(first.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(await getCode(p)).toEqual(first);
    const renewed = await getCode(p, "POST");
    expect(renewed.code).not.toBe(first.code);
    expect(await getCode(p)).toEqual(renewed);
  });

  it("el cuidador canjea el código (con o sin guion y minúsculas) y queda asignado", async () => {
    const c = await h.caregiver();
    const p = await h.patient({ email: "p@example.org" });
    const { code } = await getCode(p);
    const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    const r = await redeem(c, typed);
    expect(r.status).toBe(201);
    expect(((await r.json()) as { id: string }).id).toBe(p);
    expect(await mine(c)).toEqual([p]);
  });

  it("el código se usa una sola vez", async () => {
    const c = await h.caregiver();
    const other = await h.caregiver();
    const p = await h.patient({ email: "p@example.org" });
    const { code } = await getCode(p);
    expect((await redeem(c, code)).status).toBe(201);
    expect((await redeem(other, code)).status).toBe(404);
    expect(await mine(other)).toEqual([]);
    // Volver a canjear uno nuevo del mismo paciente no duplica la asignación.
    const next = await getCode(p);
    expect(next.code).not.toBe(code);
    expect((await redeem(c, next.code)).status).toBe(201);
    expect(await h.sql`select 1 from caregiver_patients where patient_id = ${p}`).toHaveLength(1);
  });

  it("el código vence", async () => {
    const c = await h.caregiver();
    const p = await h.patient({ email: "p@example.org" });
    const { code } = await getCode(p);
    h.setNow(new Date(Date.parse("2026-10-21T15:00:00Z") + (LINK_CODE_HOURS + 1) * 3_600_000));
    expect((await redeem(c, code)).status).toBe(404);
    expect((await getCode(p)).code).not.toBe(code);
  });

  it("limita los intentos, también los de códigos inválidos", async () => {
    const c = await h.caregiver();
    const p = await h.patient({ email: "p@example.org" });
    const { code } = await getCode(p);
    for (let i = 0; i < LINK_ATTEMPT_LIMIT; i++) {
      expect((await redeem(c, "ZZZZZZZZ")).status).toBe(404);
    }
    const over = await redeem(c, code);
    expect(over.status).toBe(429);
    expect(await mine(c)).toEqual([]);
    h.setNow(new Date(Date.parse("2026-10-21T15:00:00Z") + 2 * 3_600_000));
    // Pasada la hora ya no hay límite, y el código (vale 48 h) sigue vigente.
    expect((await redeem(c, code)).status).toBe(201);
    expect(await mine(c)).toEqual([p]);
  });

  it("solo el paciente pide código y solo el cuidador lo canjea", async () => {
    const c = await h.caregiver();
    const a = await h.admin();
    const p = await h.patient({ email: "p@example.org" });
    expect((await h.req("/patient/link-code", { as: c })).status).toBe(403);
    expect((await h.req("/patient/link-code", { as: a })).status).toBe(403);
    expect((await redeem(p, "ABCDEFGH")).status).toBe(403);
    expect((await redeem(a, "ABCDEFGH")).status).toBe(403);
    expect((await h.req("/me/patients/link", { as: c, json: { code: "" } })).status).toBe(400);
  });
});
