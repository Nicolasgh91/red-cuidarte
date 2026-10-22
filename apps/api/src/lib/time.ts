export const TZ = "America/Argentina/Buenos_Aires";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isIsoDate = (s: string): boolean => {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return (
    d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!
  );
};
export const isHHMM = (s: string): boolean => TIME_RE.test(s);

/** "HH:MM" o "HH:MM:SS" → minutos desde 00:00. */
export const toMin = (t: string): number => {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
};
export const fromMin = (n: number): string =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const hhmm = (t: string): string => t.slice(0, 5);

/** Duración en minutos; un turno que termina a la misma hora o antes cruza la medianoche. */
export const durMin = (start: string, end: string): number =>
  (toMin(end) - toMin(start) + 1440) % 1440 || 1440;

export const dayNum = (date: string): number => {
  const m = DATE_RE.exec(date)!;
  return Math.round(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) / 86_400_000);
};
export const addDays = (date: string, n: number): string =>
  new Date((dayNum(date) + n) * 86_400_000).toISOString().slice(0, 10);

/** Minutos absolutos (desde 1970) de inicio y fin de un turno. */
export const span = (s: { date: string; start: string; end: string }): [number, number] => {
  const a = dayNum(s.date) * 1440 + toMin(s.start);
  return [a, a + durMin(s.start, s.end)];
};

export const overlaps = (
  a: { date: string; start: string; end: string },
  b: { date: string; start: string; end: string },
): boolean => {
  const [a0, a1] = span(a);
  const [b0, b1] = span(b);
  return a0 < b1 && a1 > b0;
};

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Fecha y hora actuales en Argentina. */
export const nowAR = (
  now: Date,
): { date: string; minutes: number; year: number; month: number; day: number } => {
  const p = Object.fromEntries(partsFmt.formatToParts(now).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
  };
};

/** Minutos absolutos "ahora" en la misma escala que span(). */
export const nowAbs = (now: Date): number => {
  const n = nowAR(now);
  return dayNum(n.date) * 1440 + n.minutes;
};

const longFmt = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
export const longDate = (date: string): string => {
  const s = longFmt.format(new Date(dayNum(date) * 86_400_000));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
