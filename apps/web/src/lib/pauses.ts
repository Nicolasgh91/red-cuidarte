import type { IconName } from "../components/icons";

export interface Pause {
  title: string;
  desc: string;
  icon: IconName;
  secs: number;
  breath?: boolean;
  steps?: string[];
}

export const PAUSES: Record<string, Pause> = {
  respirar: {
    title: "Respirá y soltá",
    desc: "Respiración guiada",
    icon: "wind",
    secs: 240,
    breath: true,
  },
  escaneo: {
    title: "Escaneo corporal",
    desc: "Un recorrido por tu cuerpo",
    icon: "user",
    secs: 300,
    steps: [
      "Sentate o acostate cómodo. Cerrá los ojos si querés.",
      "Llevá la atención a tus pies. Notá el apoyo.",
      "Subí a las piernas. Aflojá las rodillas.",
      "Notá tu abdomen subir y bajar con la respiración.",
      "Llevá la atención al pecho. Dejá que se expanda.",
      "Soltá los hombros. Dejalos caer.",
      "Recorré brazos y manos. Abrí los dedos.",
      "Aflojá el cuello y la mandíbula.",
      "Relajá la frente y los ojos.",
      "Sentí todo tu cuerpo junto. Respirá tranquilo.",
    ],
  },
  micro: {
    title: "Micro-descanso",
    desc: "Energía entre tareas",
    icon: "coffee",
    secs: 120,
    steps: [
      "Pará lo que estés haciendo.",
      "Estirá los brazos hacia arriba.",
      "Girá los hombros hacia atrás, despacio.",
      "Tomá unos tragos de agua.",
      "Mirá lejos, por una ventana si podés.",
      "Respirá hondo y volvé a tu tarea.",
    ],
  },
  ritual: {
    title: "Ritual de desconexión",
    desc: "Cerrá el día con calma",
    icon: "moon",
    secs: 180,
    steps: [
      "Pensá en lo pendiente para mañana y dejalo anotado.",
      "Reconocé algo que hiciste bien hoy.",
      "Soltá la jornada: lavate las manos o cambiate de ropa.",
      "Hacé tres respiraciones lentas.",
      "Elegí algo agradable para los próximos minutos.",
      "El día terminó. Ahora es tu momento.",
    ],
  },
  estirar: {
    title: "Estiramientos",
    desc: "Cuello, hombros y espalda",
    icon: "walk",
    secs: 180,
    steps: [
      "Parate derecho, con los pies separados al ancho de la cadera.",
      "Inclinás la cabeza hacia un hombro. Sostené. Cambiá de lado.",
      "Girá los hombros hacia atrás, cinco veces, despacio.",
      "Entrelazá los dedos y estirá los brazos hacia adelante.",
      "Llevá los brazos arriba y estirate hacia el techo.",
      "Apoyá las manos en la cintura y arqueá suave la espalda.",
      "Sacudí manos y piernas. Listo.",
    ],
  },
};
