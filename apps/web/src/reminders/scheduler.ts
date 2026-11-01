import type { ReminderSettings } from "../api/types";
import type { IconName } from "../components/icons";
import { toMin } from "../lib/dates";

export type ReminderType = "water" | "stretch" | "relax";

/** Textos de los avisos: los usan la web (toast) y la app Android (notificación local). */
export const MESSAGES: Record<ReminderType, { icon: IconName; text: string }> = {
  water: { icon: "cup", text: "Es hora de tomar agua. Un minuto para hidratarte." },
  stretch: { icon: "walk", text: "Hora de estirarte: cuello, hombros y espalda." },
  relax: { icon: "leaf", text: "Tomate 5 minutos para relajarte." },
};

/**
 * Las dos implementaciones de los recordatorios: la web avisa dentro de la app (y con una
 * notificación del navegador) solo mientras está abierta; Android programa notificaciones locales
 * (`native.ts`).
 */
export interface ReminderScheduler {
  /** Reemplaza la programación anterior por la de estos ajustes. */
  schedule(settings: ReminderSettings): void | Promise<void>;
  /** Cancela todo lo programado. */
  cancel(): void | Promise<void>;
}

/** Un aviso que se repite todos los días a esta hora. */
interface DailyReminder {
  type: ReminderType;
  hour: number;
  minute: number;
}

/**
 * De la configuración a horarios diarios fijos (puro, para poder probarlo): agua y estiramientos
 * a partir de «Desde» cada `freq` minutos hasta «Hasta» inclusive; relajación en los horarios
 * elegidos (hasta 3). Es el mismo cálculo para la web y para Android.
 */
export function dailyReminders(settings: ReminderSettings): DailyReminder[] {
  const out: DailyReminder[] = [];
  for (const type of ["water", "stretch"] as const) {
    const r = settings[type];
    const from = toMin(r.from);
    const to = toMin(r.to);
    if (!r.on || from == null || to == null || r.freq <= 0) continue;
    for (let m = from; m <= to; m += r.freq) {
      out.push({ type, hour: Math.floor(m / 60), minute: m % 60 });
    }
  }
  if (settings.relax.on) {
    for (const t of [...new Set(settings.relax.times)].sort().slice(0, 3)) {
      const m = toMin(t);
      if (m != null) out.push({ type: "relax", hour: Math.floor(m / 60), minute: m % 60 });
    }
  }
  return out;
}

/** Qué avisos tocan en este minuto (puro, para poder probarlo). `fired` evita repetirlos. */
export function dueReminders(
  settings: ReminderSettings,
  now: Date,
  fired: Set<string>,
): ReminderType[] {
  const due: ReminderType[] = [];
  for (const r of dailyReminders(settings)) {
    if (r.hour !== now.getHours() || r.minute !== now.getMinutes()) continue;
    const key = `${r.type}|${now.toDateString()}|${r.hour}:${r.minute}`;
    if (fired.has(key)) continue;
    fired.add(key);
    due.push(r.type);
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
