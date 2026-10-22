import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

describe("persona cuidada: Hoy", () => {
  it("muestra quién la cuida ahora, el próximo turno y la medicación del día", async () => {
    const p = await h.patient({ first_name: "Elena", email: "elena@example.org" });
    const sofia = await h.caregiver({ first_name: "Sofía", last_names: "Ejemplo" });
    const luis = await h.caregiver({ first_name: "Luis", last_names: "Ejemplo" });
    await h.shift(sofia, p, "2026-10-21", "08:00", "14:00"); // ahora son las 12:00 en Argentina
    await h.shift(luis, p, "2026-10-21", "14:00", "20:00");
    await h.medication(p, "Metformina", "500 mg", ["20:00", "08:00"]);
    await h.medication(p, "Enalapril", "10 mg", ["08:00"]);
    const body = (await (await h.req("/patient/today", { as: p })).json()) as {
      patient: { first_name: string };
      current: { caregiver: string; end: string } | null;
      next: { caregiver: string } | null;
      today_shifts: unknown[];
      doses: { time: string; name: string }[];
    };
    expect(body.patient.first_name).toBe("Elena");
    expect(body.current).toMatchObject({ caregiver: "Sofía Ejemplo", end: "14:00" });
    expect(body.next).toMatchObject({ caregiver: "Luis Ejemplo" });
    expect(body.today_shifts).toHaveLength(2);
    expect(body.doses.map((d) => `${d.time} ${d.name}`)).toEqual([
      "08:00 Enalapril",
      "08:00 Metformina",
      "20:00 Metformina",
    ]);
  });

  it("no mezcla turnos ni medicación de otras personas", async () => {
    const p = await h.patient({ email: "elena@example.org" });
    const otra = await h.patient();
    const c = await h.caregiver();
    await h.shift(c, otra, "2026-10-21", "08:00", "14:00");
    await h.medication(otra, "Atorvastatina", "20 mg", ["21:00"]);
    const body = (await (await h.req("/patient/today", { as: p })).json()) as {
      current: unknown;
      next: unknown;
      doses: unknown[];
    };
    expect(body).toMatchObject({ current: null, next: null, doses: [] });
  });

  it("es de solo lectura: no hay rutas de escritura para el rol", async () => {
    const p = await h.patient({ email: "elena@example.org" });
    for (const [path, method] of [
      ["/shifts", "POST"],
      ["/tasks/completions", "POST"],
      ["/wellbeing", "POST"],
      ["/reminders", "PUT"],
      ["/admin/patients", "POST"],
    ] as const) {
      expect((await h.req(path, { as: p, method, json: {} })).status, path).toBe(403);
    }
  });
});
