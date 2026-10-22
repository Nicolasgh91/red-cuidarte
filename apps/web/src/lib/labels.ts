import type { Role } from "../api/types";

export const MOODS = ["Muy bajo", "Bajo", "Neutral", "Bien", "Muy bien"] as const;
export const ENERGY = ["Muy poca", "Poca", "Media", "Alta", "Muy alta"] as const;
export const STRESS = ["Muy poco", "Poco", "Moderado", "Alto", "Muy alto"] as const;
export const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
export const FREQS: readonly (readonly [number, string])[] = [
  [30, "Cada 30 minutos"],
  [60, "Cada hora"],
  [120, "Cada 2 horas"],
  [180, "Cada 3 horas"],
];
export const ROLES: Record<Role, string> = {
  caregiver: "Cuidador/a",
  admin: "Administrador",
  patient: "Persona cuidada",
};

export type Scale = readonly string[];

/** Etiqueta → índice 0–4 que espera la API (-1 si no existe). */
export const labelToIndex = (labels: Scale, label: string | null | undefined): number =>
  label == null ? -1 : labels.indexOf(label);

/** Índice 0–4 (o promedio) → etiqueta más cercana. */
export const indexToLabel = (labels: Scale, idx: number): string =>
  labels[Math.max(0, Math.min(labels.length - 1, Math.round(idx)))] ?? "";

export const freqLabel = (f: number): string => (FREQS.find((x) => x[0] === f) ?? FREQS[1]!)[1];

export const QUOTES = [
  "Cuidamos a quien cuida.",
  "Descansar también es cuidarte.",
  "Pedir ayuda es una forma de cuidar.",
  "Un minuto para vos también cuenta.",
  "No tenés que poder con todo.",
  "Lo que hacés todos los días importa.",
  "Respirá. Estás haciendo lo mejor que podés.",
];
export const quoteOfDay = (now: Date = new Date()): string =>
  QUOTES[
    Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 864e5) %
      QUOTES.length
  ] ?? "";

/** Número de emergencias: la spec no define uno por usuario. */
export const SAME_NUMBER = "107";

export const DISCLAIMER =
  "Es una herramienta de orientación y soporte destinada a complementar el cuidado personal. No reemplaza bajo ninguna circunstancia el consejo, diagnóstico o tratamiento médico profesional. Ante una emergencia, contáctese inmediatamente a su servicio de salud local.";
