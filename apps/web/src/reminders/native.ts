import { LocalNotifications } from "@capacitor/local-notifications";
import { MESSAGES, dailyReminders } from "./scheduler";
import type { ReminderScheduler, ReminderType } from "./scheduler";

const CHANNEL_ID = "recordatorios";

// Rangos de ids por tipo: permiten cancelar solo lo nuestro. Agua cada 30 min entre 00:00 y 23:59 = 48 como máximo.
const ID_BASE: Record<ReminderType, number> = { water: 1000, stretch: 2000, relax: 3000 };
export const reminderId = (type: ReminderType, index: number): number => ID_BASE[type] + index;
const ALL_IDS = (Object.keys(ID_BASE) as ReminderType[]).flatMap((t) =>
  Array.from({ length: 100 }, (_, i) => reminderId(t, i)),
);

/**
 * Recordatorios como notificaciones locales del dispositivo (funcionan con la app cerrada y se
 * restauran al reiniciar el celular). Se programan sin alarma exacta: no hace falta el permiso
 * SCHEDULE_EXACT_ALARM (Google Play lo restringe) y un aviso de agua puede demorarse unos minutos.
 */
export function createNativeReminderScheduler(): ReminderScheduler {
  // Las operaciones se encolan: un cancel() tardío no puede borrar lo que acaba de programar schedule().
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>) => {
    queue = queue.then(fn, fn).catch((e: unknown) => console.warn("recordatorios:", e));
    return queue as Promise<void>;
  };

  const clear = async () => {
    const { notifications } = await LocalNotifications.getPending();
    const ours = notifications.filter((n) => ALL_IDS.includes(n.id));
    if (ours.length)
      await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  };

  return {
    schedule: (settings) =>
      enqueue(async () => {
        await clear();
        const items = dailyReminders(settings);
        if (!items.length) return;
        let perm = await LocalNotifications.checkPermissions();
        if (perm.display === "prompt" || perm.display === "prompt-with-rationale") {
          perm = await LocalNotifications.requestPermissions();
        }
        if (perm.display !== "granted") return;
        await LocalNotifications.createChannel({
          id: CHANNEL_ID,
          name: "Recordatorios",
          description: "Agua, estiramientos y pausas para relajarte",
          importance: 4,
        });
        const counters: Record<ReminderType, number> = { water: 0, stretch: 0, relax: 0 };
        await LocalNotifications.schedule({
          notifications: items.map((it) => ({
            id: reminderId(it.type, counters[it.type]++),
            title: "Cuidarte+",
            body: MESSAGES[it.type].text,
            channelId: CHANNEL_ID,
            schedule: { on: { hour: it.hour, minute: it.minute }, allowWhileIdle: true },
            isExactNotification: false,
          })),
        });
      }),
    cancel: () => enqueue(clear),
  };
}
