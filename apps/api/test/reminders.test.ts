import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

const valid = {
  water: { on: true, freq: 30, from: "07:00", to: "21:00" },
  stretch: { on: false, freq: 120, from: "09:00", to: "19:00" },
  relax: { on: true, times: ["16:00", "11:00", "11:00"] },
};

describe("recordatorios", () => {
  it("devuelve los valores por defecto si todavía no hay configuración", async () => {
    const c = await h.caregiver();
    expect(await (await h.req("/reminders", { as: c })).json()).toMatchObject({
      water: { on: true, freq: 60 },
      relax: { on: false, times: [] },
    });
  });

  it("guarda, ordena los horarios de relajación y restaura la configuración", async () => {
    const c = await h.caregiver();
    expect((await h.req("/reminders", { as: c, method: "PUT", json: valid })).status).toBe(200);
    expect(await (await h.req("/reminders", { as: c })).json()).toEqual({
      ...valid,
      relax: { on: true, times: ["11:00", "16:00"] },
    });
    expect(
      (
        await h.req("/reminders", {
          as: c,
          method: "PUT",
          json: { ...valid, water: { ...valid.water, freq: 45 } },
        })
      ).status,
    ).toBe(400);
    expect(await h.sql`select 1 from reminder_settings`).toHaveLength(1);
  });

  it("exige que «Hasta» sea posterior a «Desde» solo si el aviso está encendido", async () => {
    const c = await h.caregiver();
    const bad = { ...valid, water: { on: true, freq: 60, from: "20:00", to: "08:00" } };
    expect((await h.req("/reminders", { as: c, method: "PUT", json: bad })).status).toBe(400);
    expect(
      (
        await h.req("/reminders", {
          as: c,
          method: "PUT",
          json: { ...bad, water: { ...bad.water, on: false } },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await h.req("/reminders", {
          as: c,
          method: "PUT",
          json: { ...valid, relax: { on: true, times: ["1", "2", "3", "4"] } },
        })
      ).status,
    ).toBe(400);
  });

  it("cada cuidador tiene los suyos", async () => {
    const a = await h.caregiver();
    const b = await h.caregiver();
    await h.req("/reminders", { as: a, method: "PUT", json: valid });
    expect(await (await h.req("/reminders", { as: b })).json()).toMatchObject({
      water: { freq: 60 },
    });
  });
});
