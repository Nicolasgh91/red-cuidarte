import type { ReminderSettings } from "../api/types";
import { pad, toMin } from "../lib/dates";

export type ReminderType = "water" | "stretch" | "relax";

/**
 * Punto de extensión de los recordatorios. La web usa avisos dentro de la app (y notificación
 * del navegador) solo mientras está abierta; la app de Android (fase F9a) va a implementar esta
 * misma interfaz con notificaciones locales de Capacitor.
 */
export interface ReminderScheduler {
  /** Reemplaza la programación anterior por la de estos ajustes. */
  schedule(settings: ReminderSettings): void | Promise<void>;
  /** Cancela todo lo programado. */
  cancel(): void | Promise<void>;
}

/** Qué avisos tocan en este minuto (puro, para poder probarlo). `fired` evita repetirlos. */
export function dueReminders(
  settings: ReminderSettings,
  now: Date,
  fired: Set<string>,
): ReminderType[] {
  const due: ReminderType[] = [];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const day = now.toDateString();
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  for (const k of ["water", "stretch"] as const) {
    const r = settings[k];
    if (!r.on) continue;
    const from = toMin(r.from);
    const to = toMin(r.to);
    const key = `${k}|${day}|${hm}`;
    if (
      from != null &&
      to != null &&
      minutes >= from &&
      minutes <= to &&
      (minutes - from) % r.freq === 0 &&
      !fired.has(key)
    ) {
      fired.add(key);
      due.push(k);
    }
  }
  const key = `relax|${day}|${hm}`;
  if (settings.relax.on && settings.relax.times.includes(hm) && !fired.has(key)) {
    fired.add(key);
    due.push("relax");
  }
  return due;
}

export interface WebSchedulerOptions {
  now?: () => Date;
  /** Cada cuánto revisa (ms). */
  intervalMs?: number;
}

/** Implementación web: revisa cada 20 s mientras la app está abierta. */
export function createWebReminderScheduler(
  notify: (type: ReminderType) => void,
  opts: WebSchedulerOptions = {},
): ReminderScheduler {
  const now = opts.now ?? (() => new Date());
  const fired = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let current: ReminderSettings | null = null;

  const check = () => {
    if (!current) return;
    for (const type of dueReminders(current, now(), fired)) notify(type);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  return {
    schedule(settings) {
      current = settings;
      stop();
      timer = setInterval(check, opts.intervalMs ?? 20_000);
    },
    cancel() {
      stop();
      current = null;
    },
  };
}
