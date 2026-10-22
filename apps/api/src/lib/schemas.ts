import { z } from "zod";
import { isHHMM, isIsoDate } from "./time.js";

export const uuid = z.uuid({ error: "Identificador inválido." });
export const isoDate = z.string().refine(isIsoDate, "Fecha inválida (usá AAAA-MM-DD).");
export const hhmmTime = z.string().refine(isHHMM, "Horario inválido (usá HH:MM).");
const name = (label: string) => z.string().trim().min(1, `Falta ${label}.`).max(100);

export const phone = z
  .string()
  .trim()
  .regex(/^[1-9][\d ]{7,14}$/, "Revisá el teléfono: con código de área, sin el 0 ni el 15.");
export const email = z.string().trim().toLowerCase().pipe(z.email("Revisá el mail."));
export const birthDate = isoDate.refine(
  (d) => d > "1900-01-01" && d < new Date().toISOString().slice(0, 10),
  "Revisá la fecha de nacimiento.",
);

export const caregiverProfile = z.object({
  first_name: name("el nombre"),
  last_names: name("los apellidos"),
  phone,
  email,
  birth_date: birthDate,
});

export const newCaregiver = caregiverProfile.extend({ patient_ids: z.array(uuid).default([]) });
export const newPatient = z.object({
  first_name: name("el nombre"),
  last_name: name("el apellido"),
  /** Opcional: con mail la persona puede ingresar; sin mail es solo una ficha. */
  email: email.optional(),
});

export const newMedication = z.object({
  name: name("el medicamento"),
  dose: name("la dosis"),
  times: z.array(hhmmTime).min(1, "Agregá al menos un horario.").max(12),
});

export const newShift = z
  .object({
    patient_id: uuid,
    date: isoDate,
    start: hhmmTime,
    end: hhmmTime,
    repeat_weeks: z.union([z.literal(1), z.literal(4), z.literal(8)]).default(1),
  })
  .refine((s) => s.start !== s.end, {
    message: "El turno no puede empezar y terminar a la misma hora.",
    path: ["end"],
  });

export const scale = z.number().int().min(0).max(4);
export const newWellbeing = z.object({
  mood: scale,
  energy: scale,
  stress: scale,
  note: z.string().trim().max(500).default(""),
});

const interval = z
  .object({
    on: z.boolean(),
    freq: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(180)]),
    from: hhmmTime,
    to: hhmmTime,
  })
  .refine((r) => !r.on || r.to > r.from, {
    message: "El horario «Hasta» tiene que ser posterior a «Desde».",
  });

export const reminderSettings = z.object({
  water: interval,
  stretch: interval,
  relax: z.object({ on: z.boolean(), times: z.array(hhmmTime).max(3) }),
});

export const DEFAULT_REMINDERS = {
  water: { on: true, freq: 60, from: "08:00", to: "20:00" },
  stretch: { on: true, freq: 120, from: "09:00", to: "19:00" },
  relax: { on: false, times: [] as string[] },
};
