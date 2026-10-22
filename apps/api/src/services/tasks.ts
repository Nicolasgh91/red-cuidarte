import type { Sql } from "../db.js";
import { badRequest } from "../errors.js";
import { hhmm, toMin } from "../lib/time.js";
import type { Medication } from "./medications.js";

export interface TaskItem {
  key: string;
  text: string;
  time: string | null;
  med: boolean;
  done: boolean;
}

export const medKey = (medicationId: string, time: string) => `med-${medicationId}-${time}`;

/** Checklist del día de un paciente: plantillas + tomas de medicación, ordenado por horario. */
export async function checklist(
  sql: Sql,
  patientId: string,
  date: string,
  meds: Medication[],
): Promise<TaskItem[]> {
  const templates = await sql<{ id: string; text: string; time: string | null }[]>`
    select id, text, time from task_templates where patient_id = ${patientId}`;
  const done = new Set(
    (
      await sql<
        { task_key: string }[]
      >`select task_key from task_completions where date = ${date} and patient_id = ${patientId}`
    ).map((r) => r.task_key),
  );
  const items: TaskItem[] = [
    ...meds.flatMap((m) =>
      m.times.map((t) => ({
        key: medKey(m.id, t),
        text: `Dar ${m.name} ${m.dose}`,
        time: t,
        med: true,
        done: done.has(medKey(m.id, t)),
      })),
    ),
    ...templates.map((t) => ({
      key: t.id,
      text: t.text,
      time: t.time ? hhmm(t.time) : null,
      med: false,
      done: done.has(t.id),
    })),
  ];
  return items.sort((a, b) => (a.time ? toMin(a.time) : 9999) - (b.time ? toMin(b.time) : 9999));
}

export async function assertTaskKey(
  sql: Sql,
  patientId: string,
  key: string,
  meds: Medication[],
): Promise<void> {
  const med = /^med-([0-9a-f-]{36})-(\d{2}:\d{2})$/.exec(key);
  if (med) {
    if (meds.some((m) => m.id === med[1] && m.times.includes(med[2]!))) return;
  } else if (/^[0-9a-f-]{36}$/.test(key)) {
    const [row] =
      await sql`select 1 from task_templates where id = ${key} and patient_id = ${patientId}`;
    if (row) return;
  }
  throw badRequest("Esa tarea no existe para este paciente.", "unknown_task");
}
