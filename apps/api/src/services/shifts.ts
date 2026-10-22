import type { Sql } from "../db.js";
import { badRequest, conflict } from "../errors.js";
import { addDays, hhmm, longDate, overlaps } from "../lib/time.js";
import { assertAssigned } from "./access.js";

export interface Shift {
  id: string;
  caregiver_id: string;
  patient_id: string;
  date: string;
  start: string;
  end: string;
  source: "manual" | "assistant";
}

interface ShiftRow {
  id: string;
  caregiver_id: string;
  patient_id: string;
  date: string;
  start_time: string;
  end_time: string;
  source: "manual" | "assistant";
}

const toShift = (r: ShiftRow): Shift => ({
  id: r.id,
  caregiver_id: r.caregiver_id,
  patient_id: r.patient_id,
  date: r.date,
  start: hhmm(r.start_time),
  end: hhmm(r.end_time),
  source: r.source,
});

export async function listShifts(
  sql: Sql,
  caregiverId: string,
  from: string,
  to: string,
): Promise<Shift[]> {
  // Se trae un día antes: un turno de la noche anterior puede terminar dentro del rango.
  const rows = await sql<ShiftRow[]>`
    select id, caregiver_id, patient_id, date, start_time, end_time, source
    from shifts
    where caregiver_id = ${caregiverId} and date between ${addDays(from, -1)} and ${to}
    order by date, start_time`;
  return rows.map(toShift).filter((s) => s.date >= from || spillsInto(s, from));
}

const spillsInto = (s: Shift, from: string): boolean =>
  s.end <= s.start && addDays(s.date, 1) >= from;

export interface NewShift {
  patient_id: string;
  date: string;
  start: string;
  end: string;
}

/**
 * Valida y crea turnos para un cuidador, todo o nada. Los mismos controles los usa el asistente.
 * Lanza 409 si alguno se superpone con un turno existente (incluidos los que cruzan medianoche).
 */
export async function createShifts(
  sql: Sql,
  caregiverId: string,
  items: NewShift[],
  source: "manual" | "assistant",
): Promise<Shift[]> {
  if (items.some((i) => i.start === i.end))
    throw badRequest("El turno no puede empezar y terminar a la misma hora.");
  for (const pid of new Set(items.map((i) => i.patient_id)))
    await assertAssigned(sql, caregiverId, pid);
  return sql.begin(async (tx) => {
    // Serializa altas concurrentes del mismo cuidador.
    await tx`select 1 from caregivers where user_id = ${caregiverId} for update`;
    const dates = items.map((i) => i.date).sort();
    const existing = (
      await tx<ShiftRow[]>`
        select id, caregiver_id, patient_id, date, start_time, end_time, source from shifts
        where caregiver_id = ${caregiverId} and date between ${addDays(dates[0]!, -1)} and ${addDays(dates.at(-1)!, 1)}`
    ).map(toShift);
    items.forEach((cand, i) => {
      const clash =
        existing.find((e) => overlaps(cand, e)) ?? items.slice(0, i).find((o) => overlaps(cand, o));
      if (clash) {
        throw conflict(
          `Se superpone con tu turno del ${longDate(clash.date)} de ${clash.start} a ${clash.end}.`,
          "shift_overlap",
        );
      }
    });
    try {
      const created: Shift[] = [];
      for (const i of items) {
        const [row] = await tx<ShiftRow[]>`
          insert into shifts (caregiver_id, patient_id, date, start_time, end_time, source)
          values (${caregiverId}, ${i.patient_id}, ${i.date}, ${i.start}, ${i.end}, ${source})
          returning id, caregiver_id, patient_id, date, start_time, end_time, source`;
        created.push(toShift(row!));
      }
      return created;
    } catch (e) {
      // 23P01 = restricción de exclusión (pedido simultáneo que ganó la carrera)
      if ((e as { code?: string }).code === "23P01") {
        throw conflict("Se superpone con otro de tus turnos.", "shift_overlap");
      }
      throw e;
    }
  });
}

export async function deleteShift(sql: Sql, caregiverId: string, id: string): Promise<boolean> {
  const rows =
    await sql`delete from shifts where id = ${id} and caregiver_id = ${caregiverId} returning id`;
  return rows.length > 0;
}

export const repeatWeekly = (
  n: { date: string; start: string; end: string; patient_id: string },
  weeks: number,
): NewShift[] => Array.from({ length: weeks }, (_, i) => ({ ...n, date: addDays(n.date, i * 7) }));
