// Helpers de fechas y horarios portados del prototipo. Las fechas "YYYY-MM-DD" son locales (sin zona).

export const pad = (n: number): string => String(n).padStart(2, "0");
export const iso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string): Date => {
  const [y = 0, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};
export const monday = (d: Date): Date => addDays(d, -((d.getDay() + 6) % 7));
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtLong = (d: Date): string =>
  cap(d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }));
export const fmtDM = (d: Date): string =>
  d.toLocaleDateString("es-AR", { day: "numeric", month: "long" });

/** "HH:MM" (o "HH:MM:SS") → minutos desde 00:00; null si no es un horario. */
export const toMin = (t: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const minOrZero = (t: string): number => toMin(t) ?? 0;

/** Duración en minutos; un turno que termina a la misma hora o antes cruza la medianoche. */
export const durMin = (start: string, end: string): number =>
  (minOrZero(end) - minOrZero(start) + 1440) % 1440 || 1440;

export const dayNum = (s: string): number => {
  const [y = 0, m = 1, d = 1] = s.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
};

export interface ShiftLike {
  date: string;
  start: string;
  end: string;
}
export const absStart = (sh: ShiftLike): number => dayNum(sh.date) * 1440 + minOrZero(sh.start);
export const absEnd = (sh: ShiftLike): number => absStart(sh) + durMin(sh.start, sh.end);
export const nowAbs = (now: Date = new Date()): number =>
  dayNum(iso(now)) * 1440 + now.getHours() * 60 + now.getMinutes();

export const fmtHours = (m: number): string => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};
export const hrsLabel = (sh: ShiftLike): string =>
  `${sh.start}–${sh.end}${minOrZero(sh.end) <= minOrZero(sh.start) ? " (+1)" : ""}`;

export function weekLabel(mon: Date): string {
  const sun = addDays(mon, 6);
  return mon.getMonth() === sun.getMonth()
    ? `Semana del ${mon.getDate()} al ${fmtDM(sun)}`
    : `Semana del ${fmtDM(mon)} al ${fmtDM(sun)}`;
}

export function relDay(dateIso: string, now: Date = new Date()): string {
  const diff = dayNum(dateIso) - dayNum(iso(now));
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return fmtLong(fromIso(dateIso));
}

/** "hace 5 min" / "hace 3 h" / "hace 2 d". */
export function ago(ts: number | Date | string, now: number = Date.now()): string {
  const t = typeof ts === "number" ? ts : new Date(ts).getTime();
  const m = Math.round((now - t) / 60000);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** "dd/mm/aaaa" → Date si es una fecha real, posterior a 1900 y pasada; si no, null. */
export function parseBirth(s: string, now: Date = new Date()): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getDate() === d && date.getMonth() === mo - 1 && y > 1900 && date < now ? date : null;
}
/** "dd/mm/aaaa" → "YYYY-MM-DD" (o null). */
export function birthToIso(s: string, now: Date = new Date()): string | null {
  const d = parseBirth(s, now);
  return d ? iso(d) : null;
}
/** "YYYY-MM-DD" → "dd/mm/aaaa". */
export function isoToBirth(s: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export interface NextBirthday {
  date: Date;
  days: number;
  age: number;
}
/** Próximo cumpleaños de una fecha de nacimiento ISO. */
export function nextBirthday(birthIso: string, now: Date = new Date()): NextBirthday | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(birthIso)) return null;
  const b = fromIso(birthIso.slice(0, 10));
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let n = new Date(t.getFullYear(), b.getMonth(), b.getDate());
  if (n < t) n = new Date(t.getFullYear() + 1, b.getMonth(), b.getDate());
  return { date: n, days: dayNum(iso(n)) - dayNum(iso(t)), age: n.getFullYear() - b.getFullYear() };
}

export const listJoin = (a: string[]): string =>
  a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} y ${a[a.length - 1]}`;

/** Normaliza horarios escritos a mano ("8, 20:00 y 9:30") a ["08:00","09:30","20:00"]; devuelve el primero inválido. */
export function parseTimes(raw: string): { times: string[]; bad: string | null } {
  const parts = raw
    .split(/[,\sy]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (/^\d{1,2}$/.test(x) ? `${pad(Number(x))}:00` : x));
  const bad = parts.find(
    (h) => !/^\d{1,2}:\d{2}$/.test(h) || (toMin(h) ?? 1440) >= 1440 || Number(h.split(":")[1]) > 59,
  );
  if (bad) return { times: [], bad };
  const times = parts.map((h) => {
    const m = toMin(h) ?? 0;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  });
  return { times: [...new Set(times)].sort(), bad: null };
}

const gcalStamp = (day: Date, t: string): string =>
  `${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}T${t.replace(":", "")}00`;

/** Enlace "Agregar a Google Calendar" de un turno. */
export function gcalShift(sh: ShiftLike, patientName: string): string {
  const d = fromIso(sh.date);
  const end = addDays(d, minOrZero(sh.end) <= minOrZero(sh.start) ? 1 : 0);
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" +
    encodeURIComponent(`Turno · ${patientName}`) +
    "&details=" +
    encodeURIComponent("Turno de cuidado cargado en Cuidarte+.") +
    "&dates=" +
    gcalStamp(d, sh.start) +
    "/" +
    gcalStamp(end, sh.end)
  );
}

/** Enlace para programar una pausa (próxima hora en punto, 15 minutos). */
export function gcalPause(now: Date = new Date()): string {
  const s = new Date(now);
  s.setMinutes(0, 0, 0);
  s.setHours(s.getHours() + 1);
  const e = new Date(s.getTime() + 15 * 60000);
  const f = (d: Date) => gcalStamp(d, `${pad(d.getHours())}:${pad(d.getMinutes())}`);
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" +
    encodeURIComponent("Pausa · Cuidarte+") +
    "&details=" +
    encodeURIComponent("Un momento para vos: respirá, tomá agua y estirate.") +
    "&dates=" +
    f(s) +
    "/" +
    f(e)
  );
}
