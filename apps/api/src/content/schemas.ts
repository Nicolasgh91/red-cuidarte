import { z } from "zod";
import { CATS, CONTENT_ICONS } from "./site.js";
import type { ContentKey } from "./site.js";

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Hay un texto vacío.")
    .max(max, `Hay un texto demasiado largo (hasta ${max} caracteres).`);

const block = z.union([
  z.tuple([z.literal("p"), text(3000)]),
  z.tuple([z.literal("h"), text(200)]),
  z.tuple([z.literal("ul"), z.array(text(500)).min(1, "Hay una lista vacía.").max(30)]),
]);
const blocks = z.array(block).min(1, "Falta el contenido.").max(100, "Hay demasiados bloques.");

const icon = z.enum(CONTENT_ICONS, { error: "Elegí un ícono de la lista." });

const article = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, "El identificador usa minúsculas, números y guiones."),
  cat: z.enum(CATS, { error: "Elegí una categoría de la lista." }),
  icon,
  title: text(120),
  desc: text(300),
  body: blocks,
});

const page = z.object({
  title: text(120),
  sub: text(200).optional(),
  note: text(400).optional(),
  blocks,
});

/**
 * Valida lo que el admin guarda en cada clave; es la forma de `SiteContent`. Se tipa suelto porque
 * el build de Vercel compila sin `strict` y Zod infiere las tuplas distinto.
 */
export const contentSchemas: Record<ContentKey, z.ZodType> = {
  quotes: z.array(text(200)).min(1, "Dejá al menos una frase.").max(60, "Hay demasiadas frases."),
  landing: z.object({
    tagline: text(100),
    lead: text(200),
    features: z
      .array(z.object({ icon, title: text(60), text: text(240) }))
      .min(1, "Dejá al menos una característica.")
      .max(12, "Hay demasiadas características."),
    steps: z
      .array(z.object({ title: text(60), text: text(240) }))
      .min(1, "Dejá al menos un paso.")
      .max(8, "Hay demasiados pasos."),
  }),
  articles: z
    .array(article)
    .min(1, "Dejá al menos un recurso.")
    .max(60, "Hay demasiados recursos.")
    .refine(
      (l) => new Set(l.map((a) => a.id)).size === l.length,
      "Hay recursos con el mismo identificador.",
    ),
  faq: z.array(z.tuple([text(200), text(1500)])).max(60, "Hay demasiadas preguntas."),
  terminos: page,
  privacidad: page,
  acerca: page,
};
