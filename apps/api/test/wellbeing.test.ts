import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

const add = (who: string, j: object) => h.req("/wellbeing", { as: who, json: j });

describe("bienestar", () => {
  it("guarda un registro y lo lista", async () => {
    const c = await h.caregiver();
    expect(
      (await add(c, { mood: 3, energy: 2, stress: 1, note: "Salimos a caminar." })).status,
    ).toBe(201);
    const { records } = (await (await h.req("/wellbeing", { as: c })).json()) as {
      records: { mood: number; energy: number; stress: number; note: string }[];
    };
    expect(records).toEqual([
      expect.objectContaining({ mood: 3, energy: 2, stress: 1, note: "Salimos a caminar." }),
    ]);
  });

  it("valida la escala 0–4", async () => {
    const c = await h.caregiver();
    expect((await add(c, { mood: 5, energy: 2, stress: 1 })).status).toBe(400);
    expect((await add(c, { mood: -1, energy: 2, stress: 1 })).status).toBe(400);
    expect((await add(c, { mood: 1.5, energy: 2, stress: 1 })).status).toBe(400);
    expect((await add(c, { mood: 1, energy: 2 })).status).toBe(400);
  });

  it("solo el dueño lo ve: ni otro cuidador, ni el admin, ni la persona cuidada", async () => {
    const owner = await h.caregiver();
    const other = await h.caregiver();
    const admin = await h.admin();
    const patient = await h.patient({ email: "p@example.org" });
    await add(owner, { mood: 0, energy: 0, stress: 4, note: "Muy duro." });
    const mine = (await (await h.req("/wellbeing", { as: other })).json()) as {
      records: unknown[];
    };
    expect(mine.records).toEqual([]);
    for (const who of [admin, patient]) {
      for (const path of ["/wellbeing", "/wellbeing/weekly"])
        expect((await h.req(path, { as: who })).status).toBe(403);
      expect((await add(who, { mood: 1, energy: 1, stress: 1 })).status).toBe(403);
    }
  });

  it("resumen semanal: promedios y ánimo por día (hora de Argentina, semana desde el lunes)", async () => {
    const c = await h.caregiver();
    const ins = (at: string, mood: number, energy: number, stress: number) =>
      h.sql`insert into wellbeing_records (caregiver_id, at, mood, energy, stress) values (${c}, ${at}, ${mood}, ${energy}, ${stress})`;
    await ins("2026-10-19T23:30:00-03:00", 4, 4, 0); // lunes 19, noche
    await ins("2026-10-20T10:00:00-03:00", 2, 2, 2); // martes 20, mañana
    await ins("2026-10-20T20:00:00-03:00", 0, 0, 4); // martes 20, noche (último del día)
    await ins("2026-10-12T09:00:00-03:00", 3, 3, 1); // semana anterior
    const { weeks } = (await (await h.req("/wellbeing/weekly?weeks=4", { as: c })).json()) as {
      weeks: {
        week_start: string;
        count: number;
        avg_mood: number;
        avg_energy: number;
        avg_stress: number;
        mood_by_day: Record<string, number>;
      }[];
    };
    expect(weeks.map((w) => w.week_start)).toEqual(["2026-10-19", "2026-10-12"]);
    expect(weeks[0]).toMatchObject({
      count: 3,
      avg_mood: 2,
      avg_energy: 2,
      avg_stress: 2,
      mood_by_day: { "2026-10-19": 4, "2026-10-20": 0 },
    });
    expect(weeks[1]).toMatchObject({ count: 1, mood_by_day: { "2026-10-12": 3 } });
  });
});
