import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

interface ShiftDto {
  id: string;
  date: string;
  start: string;
  end: string;
  source: string;
}
const list = async (who: string, from = "2026-10-01", to = "2026-12-31") =>
  (
    (await (await h.req(`/shifts?from=${from}&to=${to}`, { as: who })).json()) as {
      shifts: ShiftDto[];
    }
  ).shifts;

describe("turnos", () => {
  it("crea un turno manual y lo lista por rango", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.assign(c, p);
    const r = await h.req("/shifts", {
      as: c,
      json: { patient_id: p, date: "2026-10-26", start: "08:00", end: "14:00" },
    });
    expect(r.status).toBe(201);
    expect(await list(c, "2026-10-26", "2026-10-26")).toEqual([
      expect.objectContaining({
        date: "2026-10-26",
        start: "08:00",
        end: "14:00",
        source: "manual",
      }),
    ]);
    expect(await list(c, "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("repite cada semana por 4 u 8 semanas", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.assign(c, p);
    const r = await h.req("/shifts", {
      as: c,
      json: { patient_id: p, date: "2026-10-26", start: "08:00", end: "14:00", repeat_weeks: 4 },
    });
    expect(((await r.json()) as { shifts: ShiftDto[] }).shifts.map((s) => s.date)).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
    expect(
      (
        await h.req("/shifts", {
          as: c,
          json: {
            patient_id: p,
            date: "2027-01-04",
            start: "08:00",
            end: "14:00",
            repeat_weeks: 3,
          },
        })
      ).status,
    ).toBe(400);
  });

  it("rechaza un turno superpuesto y no guarda ninguno de la serie", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.assign(c, p);
    await h.shift(c, p, "2026-11-09", "10:00", "12:00");
    const r = await h.req("/shifts", {
      as: c,
      json: { patient_id: p, date: "2026-10-26", start: "08:00", end: "14:00", repeat_weeks: 4 },
    });
    expect(r.status).toBe(409);
    const body = (await r.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("shift_overlap");
    expect(body.error.message).toContain("10:00 a 12:00");
    expect(await list(c)).toHaveLength(1);
  });

  it("detecta superposición con turnos que cruzan la medianoche, en los dos sentidos", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.assign(c, p);
    const add = (date: string, start: string, end: string) =>
      h.req("/shifts", { as: c, json: { patient_id: p, date, start, end } });
    expect((await add("2026-10-26", "22:00", "06:00")).status).toBe(201);
    expect((await add("2026-10-27", "02:00", "04:00")).status).toBe(409); // dentro de la noche anterior
    expect((await add("2026-10-26", "20:00", "23:00")).status).toBe(409); // pisa el inicio
    expect((await add("2026-10-27", "05:00", "09:00")).status).toBe(409); // pisa el final
    expect((await add("2026-10-27", "06:00", "08:00")).status).toBe(201); // pegado: permitido
    expect((await add("2026-10-26", "18:00", "22:00")).status).toBe(201); // pegado antes: permitido
  });

  it("no permite turnos de 0 minutos ni horarios inválidos", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.assign(c, p);
    const add = (j: object) =>
      h.req("/shifts", { as: c, json: { patient_id: p, date: "2026-10-26", ...j } });
    expect((await add({ start: "08:00", end: "08:00" })).status).toBe(400);
    expect((await add({ start: "8:00", end: "14:00" })).status).toBe(400);
    expect((await add({ start: "08:00", end: "25:00" })).status).toBe(400);
  });

  it("solo para pacientes asignados", async () => {
    const c = await h.caregiver();
    const otro = await h.patient();
    const r = await h.req("/shifts", {
      as: c,
      json: { patient_id: otro, date: "2026-10-26", start: "08:00", end: "14:00" },
    });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      "patient_not_assigned",
    );
  });

  it("un cuidador no ve ni borra los turnos de otro", async () => {
    const a = await h.caregiver();
    const b = await h.caregiver();
    const p = await h.patient();
    await h.assign(a, p);
    await h.assign(b, p);
    const shiftOfA = await h.shift(a, p, "2026-10-26", "08:00", "14:00");
    expect(await list(b)).toEqual([]);
    expect((await h.req(`/shifts/${shiftOfA}`, { as: b, method: "DELETE" })).status).toBe(404);
    expect(await list(a)).toHaveLength(1);
    expect((await h.req(`/shifts/${shiftOfA}`, { as: a, method: "DELETE" })).status).toBe(200);
    expect(await list(a)).toHaveLength(0);
  });

  it("el listado incluye el turno de la noche anterior que termina dentro del rango", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.shift(c, p, "2026-10-26", "22:00", "06:00");
    expect(await list(c, "2026-10-27", "2026-10-27")).toHaveLength(1);
    expect(await list(c, "2026-10-28", "2026-10-28")).toHaveLength(0);
  });
});
