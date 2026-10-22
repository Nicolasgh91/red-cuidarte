import type { IconName } from "../components/icons";
import type { ReminderType } from "./scheduler";

/** Textos de los avisos: los usan la web (toast) y la app Android (notificación local). */
export const MESSAGES: Record<ReminderType, { icon: IconName; text: string }> = {
  water: { icon: "cup", text: "Es hora de tomar agua. Un minuto para hidratarte." },
  stretch: { icon: "walk", text: "Hora de estirarte: cuello, hombros y espalda." },
  relax: { icon: "leaf", text: "Tomate 5 minutos para relajarte." },
};
