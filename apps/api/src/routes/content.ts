import { Hono } from "hono";
import type { AppEnv } from "../deps.js";
import { loadContent } from "../services/content.js";

/** Contenido de la web (frases, recursos, textos): público, lo ve también quien no ingresó. */
export const content = new Hono<AppEnv>().get("/", async (c) => {
  const { content: value } = await loadContent(c.get("deps").sql);
  c.header("Cache-Control", "public, max-age=30");
  return c.json(value);
});
