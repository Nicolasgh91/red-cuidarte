import type { Sql } from "../db.js";
import { contentSchemas } from "../content/schemas.js";
import { CONTENT_KEYS, DEFAULT_CONTENT } from "../content/site.js";
import type { ContentKey, SiteContent } from "../content/site.js";

/**
 * Contenido vigente: lo que guardó el admin en cada clave, o el texto original si no hay (o si
 * lo guardado dejó de ser válido). `custom` dice qué claves están editadas.
 */
export async function loadContent(
  sql: Sql,
): Promise<{ content: SiteContent; custom: ContentKey[] }> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from site_content`;
  const content: SiteContent = { ...DEFAULT_CONTENT };
  const custom: ContentKey[] = [];
  for (const key of CONTENT_KEYS) {
    const row = rows.find((r) => r.key === key);
    if (!row) continue;
    const parsed = contentSchemas[key].safeParse(row.value);
    if (!parsed.success) continue;
    (content as unknown as Record<string, unknown>)[key] = parsed.data;
    custom.push(key);
  }
  return { content, custom };
}
