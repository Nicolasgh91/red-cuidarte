import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

interface Checklist {
  patients: {
    patient: { id: string; first_name: string };
    tasks: { key: string; text: string; time: string | null; med: boolean; done: boolean }[];
  }[];
}
const get = async (who: string, date = "2026-10-21") =>
  (await (await h.req(`/tasks?date=${date}`, { as: who })).json()) as Checklist;

describe("tareas del día", () => {
  it("arma el checklist con plantillas y tomas de medicación, ordenado por horario", async () => {
    const c = await h.caregiver();
    const p = await h.patient({ first_name: "Elena" });
    await h.assign(c, p);
    const med = await h.medication(p, "Metformina", "500 mg", ["08:00", "20:00"]);
    const t1 = (await (
      await h.req("/tasks/templates", {
        as: c,
        json: { patient_id: p, text: "Ayudar con el desayuno", time: "08:30" },
      })
    ).json()) as { id: string };
    await h.req("/tasks/templates", { as: c, json: { patient_id: p, text: "Sin hora" } });
    const { patients } = await get(c);
    expect(patients).toHaveLength(1);
    expect(patients[0]!.tasks.map((t) => [t.time, t.text, t.med])).toEqual([
      ["08:00", "Dar Metformina 500 mg", true],
      ["08:30", "Ayudar con el desayuno", false],
      ["20:00", "Dar Metformina 500 mg", true],
      [null, "Sin hora", false],
    ]);
    expect(patients[0]!.tasks.map((t) => t.key)).toEqual([
      `med-${med}-08:00`,
      t1.id,
      `med-${med}-20:00`,
      expect.any(String),
    ]);
  });

  it("tilda y destilda; el progreso es por día", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.assign(c, p);
    const med = await h.medication(p, "Enalapril", "10 mg", ["08:00"]);
    const key = `med-${med}-08:00`;
    const done = (date: string, v: boolean) =>
      h.req("/tasks/completions", { as: c, json: { date, patient_id: p, task_key: key, done: v } });
    expect((await done("2026-10-21", true)).status).toBe(200);
    expect((await done("2026-10-21", true)).status).toBe(200); // idempotente
    expect((await get(c)).patients[0]!.tasks[0]!.done).toBe(true);
    expect((await get(c, "2026-10-22")).patients[0]!.tasks[0]!.done).toBe(false);
    await done("2026-10-21", false);
    expect((await get(c)).patients[0]!.tasks[0]!.done).toBe(false);
  });

  it("dos cuidadores del mismo paciente comparten el checklist", async () => {
    const a = await h.caregiver();
    const b = await h.caregiver();
    const p = await h.patient();
    await h.assign(a, p);
    await h.assign(b, p);
    const t = (await (
      await h.req("/tasks/templates", {
        as: a,
        json: { patient_id: p, text: "Almuerzo", time: "12:30" },
      })
    ).json()) as { id: string };
    await h.req("/tasks/completions", {
      as: a,
      json: { date: "2026-10-21", patient_id: p, task_key: t.id, done: true },
    });
    expect((await get(b)).patients[0]!.tasks[0]!.done).toBe(true);
  });

  it("rechaza tareas inexistentes y pacientes no asignados", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    const otro = await h.patient();
    await h.assign(c, p);
    const post = (patient_id: string, task_key: string) =>
      h.req("/tasks/completions", {
        as: c,
        json: { date: "2026-10-21", patient_id, task_key, done: true },
      });
    expect((await post(p, "med-00000000-0000-0000-0000-000000000000-08:00")).status).toBe(400);
    expect((await post(p, "cualquier-cosa")).status).toBe(400);
    expect((await post(otro, "x")).status).toBe(403);
    expect(
      (await h.req("/tasks/templates", { as: c, json: { patient_id: otro, text: "x" } })).status,
    ).toBe(403);
  });

  it("borra plantillas propias y no las de pacientes ajenos", async () => {
    const a = await h.caregiver();
    const b = await h.caregiver();
    const p = await h.patient();
    await h.assign(a, p);
    const t = (await (
      await h.req("/tasks/templates", { as: a, json: { patient_id: p, text: "Caminata" } })
    ).json()) as { id: string };
    expect((await h.req(`/tasks/templates/${t.id}`, { as: b, method: "DELETE" })).status).toBe(404);
    expect((await h.req(`/tasks/templates/${t.id}`, { as: a, method: "DELETE" })).status).toBe(200);
    expect((await get(a)).patients[0]!.tasks).toEqual([]);
  });

  it("no muestra pacientes ni medicación de otros cuidadores", async () => {
    const a = await h.caregiver();
    const b = await h.caregiver();
    const p = await h.patient({ first_name: "Raúl" });
    await h.assign(b, p);
    await h.medication(p, "Levotiroxina", "50 mcg", ["07:00"]);
    const body = await get(a);
    expect(body.patients).toEqual([]);
  });
});
