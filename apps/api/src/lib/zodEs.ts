import { z } from "zod";

/** Artículo + nombre de cada campo que llega en un cuerpo, query o parámetro. */
const FIELD: Record<string, string> = {
  first_name: "el nombre",
  last_name: "el apellido",
  last_names: "los apellidos",
  phone: "el teléfono",
  email: "el mail",
  birth_date: "la fecha de nacimiento",
  password: "la contraseña",
  role: "el tipo de cuenta",
  subject: "el asunto",
  message: "el mensaje",
  code: "el código",
  name: "el nombre",
  dose: "la dosis",
  times: "los horarios",
  patient_id: "la persona cuidada",
  patient_ids: "las personas cuidadas",
  date: "la fecha",
  from: "la fecha de inicio",
  start: "el horario de inicio",
  end: "el horario de fin",
  repeat_weeks: "la repetición",
  mood: "el ánimo",
  energy: "la energía",
  stress: "el estrés",
  note: "la nota",
  id: "el identificador",
  limit: "el límite",
  weeks: "la cantidad de semanas",
};

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * Mensajes de zod en español para lo que el esquema no redactó a mano (los de cada esquema ganan).
 * Sin esto el usuario ve «Invalid input: expected string, received undefined».
 */
export function spanishIssue(iss: {
  code: string;
  path?: PropertyKey[];
  input?: unknown;
  origin?: string;
  minimum?: unknown;
  maximum?: unknown;
}): string {
  const key = [...(iss.path ?? [])].reverse().find((p) => typeof p === "string") as
    string | undefined;
  const field = key ? FIELD[key] : undefined;
  if (!field) return "Revisá los datos enviados.";
  const isText = iss.origin === "string";
  switch (iss.code) {
    case "invalid_type":
      return iss.input === undefined || iss.input === null
        ? `Falta ${field}.`
        : `Revisá ${field}: el formato no es válido.`;
    case "too_small":
      if (iss.origin === "array") return `Falta ${field}: agregá al menos ${iss.minimum}.`;
      if (isText && iss.minimum === 1) return `Falta ${field}.`;
      return isText
        ? `${cap(field)} tiene que tener al menos ${iss.minimum} caracteres.`
        : `Revisá ${field}: es demasiado chico.`;
    case "too_big":
      if (iss.origin === "array")
        return `Hay demasiados datos en ${field} (máximo ${iss.maximum}).`;
      return isText
        ? `${cap(field)} puede tener hasta ${iss.maximum} caracteres.`
        : `Revisá ${field}: es demasiado grande.`;
    default:
      return `Revisá ${field}.`;
  }
}

z.config({ customError: spanishIssue });
