import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useReminders } from "../api/queries/reminders";
import { Icon } from "../components/icons";
import { useLayer } from "../components/Layer";
import { useToast } from "../components/Toasts";
import { MESSAGES } from "./messages";
import { createWebReminderScheduler } from "./scheduler";
import type { ReminderScheduler, ReminderType } from "./scheduler";

type Notify = (type: ReminderType) => void;
const NotifierContext = createContext<Notify | null>(null);

/** Muestra un aviso en la app y, si hay permiso, una notificación del navegador. */
export function useNotifier(): Notify {
  const ctx = useContext(NotifierContext);
  if (!ctx) throw new Error("useNotifier fuera de RemindersRuntime");
  return ctx;
}

/**
 * Provee `notify` y mantiene programados los recordatorios del cuidador (GET /reminders).
 * `createScheduler` es el punto donde una app nativa enchufa otra implementación.
 */
export function RemindersRuntime({
  children,
  createScheduler = createWebReminderScheduler,
}: {
  children: ReactNode;
  createScheduler?: (notify: Notify) => ReminderScheduler;
}) {
  const { toast } = useToast();
  const { openPlayer } = useLayer();
  const { data } = useReminders();

  const notify = useMemo<Notify>(
    () => (type) => {
      const m = MESSAGES[type];
      toast(
        <>
          <Icon name={m.icon} />{" "}
          <span>
            {m.text}
            {type === "stretch" && (
              <>
                {" "}
                <button onClick={() => openPlayer("estirar")}>Empezar</button>
              </>
            )}
            {type === "relax" && (
              <>
                {" "}
                <Link to="/pausa">Ver pausas</Link>
              </>
            )}
          </span>
        </>,
        9000,
      );
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Cuidarte+", { body: m.text });
        }
      } catch {
        /* algunos navegadores móviles no permiten new Notification */
      }
    },
    [toast, openPlayer],
  );

  const scheduler = useMemo(() => createScheduler(notify), [createScheduler, notify]);
  useEffect(() => {
    if (data) void scheduler.schedule(data);
    return () => void scheduler.cancel();
  }, [scheduler, data]);

  return <NotifierContext.Provider value={notify}>{children}</NotifierContext.Provider>;
}
