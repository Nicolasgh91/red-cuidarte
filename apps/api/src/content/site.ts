// Contenido editable de la web: tipos y textos originales. El admin puede reemplazar cada clave
// (se guarda en la tabla site_content); sin reemplazo, vale lo que está acá. Lo importa también la
// web, así que no debe depender de nada de la API (ni de zod).
import { ARTICLES, CATS, FAQ } from "./index.js";
import type { Article, ArticleBlock } from "./index.js";

export type Block = ArticleBlock;

/** Íconos que se pueden elegir al editar recursos y la landing (existen en la web). */
export const CONTENT_ICONS = [
  "brain",
  "chat",
  "coffee",
  "moon",
  "sprout",
  "walk",
  "pause",
  "calendar",
  "sun",
  "bell",
  "book",
  "heart",
  "users",
  "list",
  "sparkle",
] as const;
export type ContentIcon = (typeof CONTENT_ICONS)[number];

export interface LandingContent {
  tagline: string;
  lead: string;
  features: { icon: ContentIcon; title: string; text: string }[];
  steps: { title: string; text: string }[];
}

export interface PageContent {
  title: string;
  sub?: string;
  note?: string;
  blocks: Block[];
}

const PAGE_KEYS = ["terminos", "privacidad", "acerca"] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export interface SiteContent {
  quotes: string[];
  landing: LandingContent;
  articles: Article[];
  faq: [string, string][];
  terminos: PageContent;
  privacidad: PageContent;
  acerca: PageContent;
}
export type ContentKey = keyof SiteContent;
export const CONTENT_KEYS = [
  "quotes",
  "landing",
  "articles",
  "faq",
  ...PAGE_KEYS,
] as const satisfies readonly ContentKey[];

export const DEFAULT_QUOTES: string[] = [
  "Cuidamos a quien cuida.",
  "Descansar también es cuidarte.",
  "Pedir ayuda es una forma de cuidar.",
  "Un minuto para vos también cuenta.",
  "No tenés que poder con todo.",
  "Lo que hacés todos los días importa.",
  "Respirá. Estás haciendo lo mejor que podés.",
];

const DEFAULT_LANDING: LandingContent = {
  tagline: "Cuidamos a quien cuida",
  lead: "Vos sostenés a otros. Nosotros te acompañamos a vos.",
  features: [
    {
      icon: "pause",
      title: "Pausas guiadas",
      text: "Respiración y estiramientos de pocos minutos, para hacer en cualquier momento.",
    },
    {
      icon: "calendar",
      title: "Turnos y tareas",
      text: "Tus horarios y las tareas del día de cada persona que cuidás, en un solo lugar.",
    },
    {
      icon: "sun",
      title: "Tu bienestar",
      text: "Un registro diario de cómo estás. Lo ves solo vos.",
    },
    {
      icon: "bell",
      title: "Recordatorios",
      text: "Avisos para tomar agua, estirarte y frenar un rato.",
    },
    {
      icon: "chat",
      title: "Asistente",
      text: "Consultá tus turnos o cargalos escribiendo, como en un chat.",
    },
    {
      icon: "book",
      title: "Recursos",
      text: "Lecturas breves para cuidar sin dejar de cuidarte.",
    },
  ],
  steps: [
    { title: "Creá tu cuenta", text: "Con tu mail y una contraseña. Lleva un minuto." },
    {
      title: "Registrá tu dispositivo",
      text: "Tu cuenta queda ligada a tu celular o computadora con la huella, el rostro o el bloqueo de pantalla.",
    },
    {
      title: "Empezá",
      text: "Sumá a las personas que acompañás, o vinculalas con su código, y ya podés usar la app.",
    },
  ],
};

const PROVISIONAL =
  "Texto provisorio. Los términos definitivos deben ser revisados por un profesional legal antes del lanzamiento.";

const DEFAULT_TERMINOS: PageContent = {
  title: "Términos y privacidad",
  note: PROVISIONAL,
  blocks: [
    ["h", "Qué datos pedimos"],
    [
      "p",
      "Para cuidadores: nombre, apellidos, mail, celular y fecha de nacimiento. Para personas cuidadas: nombre, apellido, mail (si tienen cuenta) y medicación. Los administradores se cargan directamente en el sistema.",
    ],
    ["h", "Tu registro de bienestar"],
    [
      "p",
      "Cómo te sentís es información sensible según la Ley 25.326. Tus registros los ves solo vos: ni el administrador ni el asistente acceden a ellos.",
    ],
    ["h", "Datos de salud de la persona cuidada"],
    [
      "p",
      "La medicación es un dato de salud. Solo la ven el administrador y los cuidadores asignados a esa persona, y se carga con el consentimiento de la persona cuidada o de quien la represente.",
    ],
    ["h", "Un dispositivo por cuenta"],
    [
      "p",
      "Cada cuenta se usa desde un solo dispositivo. Guardamos qué dispositivo es y la última dirección IP de acceso para proteger tu cuenta. Para cambiar de dispositivo, el administrador libera la cuenta.",
    ],
    ["h", "Recordatorios y mails"],
    [
      "p",
      "Los recordatorios son opcionales. Usamos tu fecha de nacimiento para mandarte un saludo por mail en tu cumpleaños.",
    ],
    ["h", "Mensajes de contacto"],
    [
      "p",
      "Si nos escribís desde Contacto, guardamos tu mensaje (asunto y texto) y lo enviamos por mail a info@redasistir.online, con tu nombre, tu rol y el mail de tu cuenta para poder responderte. Podés mandar hasta 3 mensajes por día. No incluyas datos de salud ni de medicación.",
    ],
    ["h", "Asistente"],
    [
      "p",
      "El asistente responde con los recursos de la app, preguntas frecuentes, tus turnos y la medicación de tus pacientes. No ve tu registro de bienestar.",
    ],
    ["h", "Tus derechos"],
    ["p", "Podés ver y corregir tus datos en Mi perfil, y borrar tu cuenta con todos tus datos."],
  ],
};

const DEFAULT_PRIVACIDAD: PageContent = {
  title: "Política de privacidad",
  note: "Texto provisorio. La política definitiva debe ser revisada por un profesional legal antes del lanzamiento.",
  blocks: [
    ["h", "Quién es responsable"],
    [
      "p",
      "Cuidarte+ es una aplicación de Red Cuidar. Para consultas sobre tus datos escribí a info@redasistir.online.",
    ],
    ["h", "Qué datos guardamos"],
    [
      "p",
      "Cuidadores: nombre, apellidos, mail, celular y fecha de nacimiento; sus turnos, las tareas que tildan, su configuración de recordatorios y los registros de bienestar. Personas cuidadas: nombre, apellido, mail (si tienen cuenta) y medicación (nombre, dosis y horarios). Administradores: nombre, apellido, mail y celular. Para proteger cada cuenta también guardamos una credencial del dispositivo (passkey), su descripción, la última dirección IP de acceso y los intentos de ingreso desde otros dispositivos. Si nos escribís desde el formulario de Contacto, guardamos tu mensaje (asunto y texto) junto con tu cuenta y lo enviamos por mail a info@redasistir.online; no incluyas datos de salud ni de medicación en esos mensajes.",
    ],
    ["h", "Datos de salud"],
    [
      "p",
      "La medicación y los registros de bienestar son datos de salud, considerados sensibles por la Ley 25.326. La medicación solo la ven los administradores y los cuidadores asignados a esa persona, y se carga con el consentimiento de la persona cuidada o de quien la represente; se guarda cifrada. Los registros de bienestar los ve únicamente el cuidador que los hizo: ni los administradores ni el asistente acceden a ellos.",
    ],
    ["h", "Para qué los usamos"],
    [
      "p",
      "Para que la app funcione: mostrar turnos y tareas, armar el checklist de medicación, enviarte recordatorios que vos configurás, saludarte por mail en tu cumpleaños y permitir que cada cuenta se use desde un solo dispositivo.",
    ],
    ["h", "Asistente"],
    [
      "p",
      "Cuando le escribís al asistente, tu mensaje y la conversación en curso se envían a Groq, el proveedor del modelo de lenguaje, junto con información de la app para poder responder: preguntas frecuentes, recursos, tus pacientes asignados, su medicación y tus turnos. No enviamos tu registro de bienestar. Cuidarte+ no guarda las conversaciones. No des diagnósticos ni cambies medicación según lo que diga el asistente: consultá a un profesional.",
    ],
    ["h", "Con quién se comparten"],
    [
      "p",
      "No vendemos datos. Usamos proveedores que los procesan por nuestra cuenta: Supabase (base de datos y autenticación), Vercel (alojamiento), el proveedor de correo de la casilla de contacto y Groq (asistente).",
    ],
    ["h", "Ubicación"],
    [
      "p",
      "La app no recopila ni guarda tu ubicación. El botón de urgencia abre el marcador del teléfono con el número de emergencias.",
    ],
    ["h", "Recordatorios"],
    [
      "p",
      "En la app de Android los recordatorios son notificaciones locales programadas en tu dispositivo; la app te pide permiso para mostrarlas.",
    ],
    ["h", "Cuánto tiempo y tus derechos"],
    [
      "p",
      "Podés ver y corregir tus datos en Mi perfil y borrar tu cuenta con todos tus datos desde Mi perfil › Borrar mi cuenta. Para ejercer tus derechos de acceso, rectificación y supresión también podés escribirnos.",
    ],
    [
      "p",
      "La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, recibe las denuncias y reclamos por incumplimiento de las normas de protección de datos personales.",
    ],
  ],
};

const DEFAULT_ACERCA: PageContent = {
  title: "Acerca de Red Cuidar",
  sub: "Cuidamos a quien cuida",
  note: "Cuidarte+ acompaña, pero no reemplaza la atención profesional.",
  blocks: [
    ["p", "Vos sostenés a otros. Nosotros te acompañamos a vos."],
    [
      "p",
      "La Red Cuidar acompaña a las personas que cuidan a adultos mayores: familiares y profesionales que sostienen el cuidado todos los días.",
    ],
    [
      "p",
      "Cuidarte+ es su espacio digital: pausas guiadas, recursos, recordatorios, turnos, tareas y un registro diario de cómo estás, para que cuidar a otro no signifique dejar de cuidarte.",
    ],
  ],
};

export const DEFAULT_CONTENT: SiteContent = {
  quotes: DEFAULT_QUOTES,
  landing: DEFAULT_LANDING,
  articles: [...ARTICLES].map((a) => ({ ...a, body: a.body.map((b) => b) })),
  faq: FAQ.map((f) => [f[0], f[1]]),
  terminos: DEFAULT_TERMINOS,
  privacidad: DEFAULT_PRIVACIDAD,
  acerca: DEFAULT_ACERCA,
};

export { CATS };
