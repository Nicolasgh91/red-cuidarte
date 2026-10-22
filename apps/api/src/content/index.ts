// Contenido estático de Cuidarte+ (recursos y preguntas frecuentes), tomado del prototipo v2.
// Lo usan el front (pantalla Recursos y FAQ) y el asistente (contexto del modelo).

export type ArticleBlock =
  readonly ["p", string] | readonly ["h", string] | readonly ["ul", readonly string[]];

export interface Article {
  id: string;
  cat: Category;
  icon: string;
  title: string;
  desc: string;
  body: readonly ArticleBlock[];
}

export const ARTICLES: readonly Article[] = [
  {
    id: "estres",
    cat: "Salud mental",
    icon: "brain",
    title: "Manejo del estrés del cuidador",
    desc: "Señales de alerta y estrategias para prevenir el agotamiento emocional.",
    body: [
      [
        "p",
        "Cuidar todos los días a otra persona pide mucha energía. Es común que el cansancio se acumule sin que lo notes hasta que pesa demasiado.",
      ],
      ["h", "Señales de alerta"],
      [
        "ul",
        [
          "Cansancio que no se va aunque descanses.",
          "Irritabilidad o ganas de llorar sin un motivo claro.",
          "Dormir mal o muy poco.",
          "Dejar de ver amigos o de hacer cosas que te gustaban.",
          "Postergar tus propios controles de salud.",
        ],
      ],
      ["h", "Qué podés hacer"],
      [
        "ul",
        [
          "Pedí ayuda concreta: un día, un horario, una tarea.",
          "Hacé pausas cortas varias veces al día, aunque sean de un minuto.",
          "Hablá con alguien de confianza sobre cómo te sentís.",
          "Si las señales duran más de dos semanas, consultá con un profesional de salud.",
        ],
      ],
    ],
  },
  {
    id: "rituales",
    cat: "Descanso",
    icon: "moon",
    title: "Rituales para desconectar al final del día",
    desc: "Prácticas simples para separar tu labor de tu descanso.",
    body: [
      [
        "p",
        "Cuando el cuidado no tiene horario fijo, cuesta cortar. Un ritual corto le avisa a tu cuerpo que la jornada terminó.",
      ],
      [
        "ul",
        [
          "Anotá en un papel lo pendiente para mañana. Lo que está escrito no hace falta recordarlo.",
          "Cambiate de ropa o lavate la cara y las manos: marca un antes y un después.",
          "Bajá la luz y dejá el celular lejos media hora antes de dormir.",
          "Hacé tres respiraciones lentas, con la exhalación más larga que la inhalación.",
          "Nombrá una cosa que hiciste bien hoy.",
        ],
      ],
      [
        "p",
        "Elegí uno o dos y repetilos todas las noches. La constancia importa más que la duración.",
      ],
    ],
  },
  {
    id: "arte",
    cat: "Autocuidado",
    icon: "sprout",
    title: "El arte de cuidarse mientras se cuida",
    desc: "Pautas esenciales para mantener tu salud física y emocional como cuidador/a.",
    body: [
      [
        "p",
        "Para sostener a otro necesitás estar en pie. Cuidarte no es egoísmo: es parte del cuidado.",
      ],
      [
        "ul",
        [
          "Comé a horario y tomá agua durante el día.",
          "Mantené tus propios turnos médicos.",
          "Moverte un poco cada día ayuda: caminar, estirar, subir escaleras.",
          "Reservá un rato por semana solo para vos.",
          "Aceptá que no todo va a salir perfecto.",
        ],
      ],
      [
        "p",
        "Si sentís que no podés más, decilo. Pedir ayuda a tiempo evita que el agotamiento se vuelva enfermedad.",
      ],
    ],
  },
  {
    id: "micro",
    cat: "Autocuidado",
    icon: "coffee",
    title: "Micro-momentos de autocuidado en el día",
    desc: "Pequeños gestos que caben en cualquier jornada y recargan tu energía.",
    body: [
      [
        "p",
        "No siempre hay una hora libre, pero casi siempre hay un minuto. Estos gestos entran en cualquier rutina:",
      ],
      [
        "ul",
        [
          "Tomar un vaso de agua despacio, sin hacer otra cosa.",
          "Estirar brazos y cuello mientras se calienta algo.",
          "Salir a la ventana o al patio y mirar lejos durante un minuto.",
          "Escuchar una canción que te guste.",
          "Mandar un mensaje a alguien que te hace bien.",
        ],
      ],
      ["p", "Sumados, varios momentos chicos cambian cómo llegás al final del día."],
    ],
  },
  {
    id: "comunicacion",
    cat: "Técnica",
    icon: "chat",
    title: "Comunicación empática con la persona cuidada",
    desc: "Claves para conectar desde el respeto y la escucha activa.",
    body: [
      [
        "ul",
        [
          "Hablá de frente, a la altura de sus ojos y sin apuro.",
          "Usá frases cortas y una idea por vez.",
          "Preguntá antes de hacer: «¿Te ayudo a levantarte?».",
          "Escuchá sin corregir cada detalle. Muchas veces importa más la emoción que el dato.",
          "Ofrecé opciones simples: «¿Querés té o café?».",
          "Si hay enojo, bajá el tono y esperá. Volvé a intentar más tarde.",
        ],
      ],
      [
        "p",
        "Respetar sus tiempos y decisiones, aunque sean pequeñas, cuida su dignidad y también la relación.",
      ],
    ],
  },
  {
    id: "movilizacion",
    cat: "Técnica",
    icon: "walk",
    title: "Técnicas para la movilización de adultos mayores",
    desc: "Pautas seguras para asistir en transferencias y movilidad sin lesionarte.",
    body: [
      [
        "ul",
        [
          "Antes de mover, explicá qué van a hacer y pedí que colabore en lo que pueda.",
          "Acercate a la persona: cuanto más cerca, menos esfuerzo para tu espalda.",
          "Separá los pies para tener una base firme y flexioná las rodillas.",
          "Mantené la espalda recta y hacé fuerza con las piernas, no con la cintura.",
          "Evitá girar el tronco: mové los pies para cambiar de dirección.",
          "Usá apoyos disponibles: barandas, sillas firmes, cinturones de transferencia.",
        ],
      ],
      [
        "p",
        "Si el peso o la situación superan lo que podés hacer sin riesgo, no lo hagas sola/o. Pedí que un kinesiólogo o profesional te enseñe la técnica adecuada para esa persona.",
      ],
    ],
  },
];

export const CATS = ["Salud mental", "Descanso", "Autocuidado", "Técnica"] as const;
export type Category = (typeof CATS)[number];

export const FAQ: readonly (readonly [string, string])[] = [
  [
    "¿Cómo cargo mis turnos?",
    "Contáselos al asistente, por ejemplo «trabajo lunes y miércoles de 8 a 14 con Elena», o usá Turnos › Agregar turno.",
  ],
  [
    "¿Quién ve mi registro de bienestar?",
    "Solo vos. Ni el administrador ni la persona cuidada pueden verlo.",
  ],
  [
    "¿Qué hago si cambio de celular?",
    "Cada cuenta funciona en un solo dispositivo. Pedile al administrador que libere tu cuenta y entrá desde el nuevo.",
  ],
  [
    "¿Cómo cambio los recordatorios?",
    "En Pausa › Recordatorios elegís agua, estiramientos y pausas para relajarte, con sus horarios.",
  ],
  [
    "¿De dónde salen las tareas de medicación?",
    "De la ficha del paciente que carga el administrador. Si algo no coincide con la receta, avisale al administrador y seguí la indicación médica.",
  ],
  [
    "¿Qué hago ante una urgencia?",
    "Llamá al SAME (107 o el número de tu ciudad) y quedate con la persona hasta que llegue la ayuda.",
  ],
];
