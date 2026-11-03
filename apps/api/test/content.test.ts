import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { contentSchemas } from "../src/content/schemas.js";
import { CONTENT_KEYS, DEFAULT_CONTENT } from "../src/content/site.js";
import type { SiteContent } from "../src/content/site.js";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(async () => {
  await h.reset();
  await h.sql`truncate site_content`;
});
afterAll(() => h.close());

const publicContent = async () => (await (await h.req("/content")).json()) as SiteContent;
const put = (as: string, key: string, json: unknown) =>
  h.req(`/admin/content/${key}`, { as, method: "PUT", json });
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("contenido de la web", () => {
  it("es público y, sin ediciones, devuelve los textos originales", async () => {
    const c = await publicContent();
    expect(c).toEqual(JSON.parse(JSON.stringify(DEFAULT_CONTENT)));
    expect(c.quotes.length).toBeGreaterThan(3);
    expect(c.articles.length).toBeGreaterThan(3);
    expect(c.acerca.title).toBe("Acerca de Red Cuidar");
  });

  it("el admin edita una clave y todos la ven; el resto sigue igual", async () => {
    const a = await h.admin();
    expect((await put(a, "quotes", ["Una frase nueva.", " Otra. "])).status).toBe(200);
    const c = await publicContent();
    expect(c.quotes).toEqual(["Una frase nueva.", "Otra."]);
    expect(c.faq).toEqual(JSON.parse(JSON.stringify(DEFAULT_CONTENT.faq)));
    const admin = (await (await h.req("/admin/content", { as: a })).json()) as {
      custom: string[];
    };
    expect(admin.custom).toEqual(["quotes"]);
    const [row] = await h.sql`select updated_by from site_content where key = 'quotes'`;
    expect(row).toEqual({ updated_by: a });
    // editar de nuevo reemplaza, no duplica
    expect((await put(a, "quotes", ["Sola."])).status).toBe(200);
    expect((await publicContent()).quotes).toEqual(["Sola."]);
    expect(await h.sql`select 1 from site_content`).toHaveLength(1);
  });

  it("DELETE vuelve al texto original", async () => {
    const a = await h.admin();
    await put(a, "quotes", ["Sola."]);
    expect((await h.req("/admin/content/quotes", { as: a, method: "DELETE" })).status).toBe(200);
    expect((await publicContent()).quotes).toEqual(DEFAULT_CONTENT.quotes);
  });

  it("edita landing, recursos, preguntas y páginas con su forma", async () => {
    const a = await h.admin();
    const landing = {
      tagline: "Lema nuevo",
      lead: "Bajada nueva",
      features: [{ icon: "sun", title: "T", text: "X" }],
      steps: [{ title: "Paso", text: "Hacé esto" }],
    };
    const articles = [
      {
        id: "mi-recurso",
        cat: "Autocuidado",
        icon: "walk",
        title: "Mi recurso",
        desc: "Descripción",
        body: [
          ["h", "Título"],
          ["p", "Párrafo"],
          ["ul", ["uno", "dos"]],
        ],
      },
    ];
    const page = { title: "Acerca", sub: "Sub", blocks: [["p", "Hola"]] };
    expect((await put(a, "landing", landing)).status).toBe(200);
    expect((await put(a, "articles", articles)).status).toBe(200);
    expect((await put(a, "faq", [["¿P?", "R."]])).status).toBe(200);
    expect((await put(a, "acerca", page)).status).toBe(200);
    const c = await publicContent();
    expect(c.landing).toEqual(landing);
    expect(c.articles).toEqual(articles);
    expect(c.faq).toEqual([["¿P?", "R."]]);
    expect(c.acerca).toEqual(page);
    expect(c.terminos).toEqual(JSON.parse(JSON.stringify(DEFAULT_CONTENT.terminos)));
  });

  it("rechaza datos inválidos y claves que no existen", async () => {
    const a = await h.admin();
    const art = (over: object = {}) => ({
      id: "x",
      cat: "Descanso",
      icon: "moon",
      title: "T",
      desc: "D",
      body: [["p", "t"]],
      ...over,
    });
    const bad: [string, unknown][] = [
      ["quotes", []],
      ["quotes", [""]],
      ["quotes", ["x".repeat(201)]],
      ["quotes", "no es una lista"],
      ["articles", [art({ id: "Con Espacios" })]],
      ["articles", [art({ icon: "no-existe" })]],
      ["articles", [art({ cat: "Otra" })]],
      ["articles", [art(), art()]],
      ["articles", [art({ body: [["script", "x"]] })]],
      ["articles", [art({ body: [] })]],
      ["landing", { tagline: "a", lead: "b", features: [], steps: [] }],
      ["acerca", { title: "", blocks: [["p", "x"]] }],
    ];
    for (const [key, json] of bad) {
      const r = await put(a, key, json);
      expect(r.status, `${key} ${JSON.stringify(json)}`).toBe(400);
      expect(await code(r)).toBe("invalid_input");
    }
    expect((await put(a, "otra-cosa", ["x"])).status).toBe(400);
    expect(
      (
        await h.req("/admin/content/quotes", {
          as: a,
          method: "PUT",
          headers: { "Content-Type": "application/json" },
        })
      ).status,
    ).toBe(400);
    expect(await h.sql`select 1 from site_content`).toHaveLength(0);
  });

  it("si lo guardado dejó de ser válido, se usa el texto original", async () => {
    await h.sql`insert into site_content (key, value) values ('quotes', ${h.sql.json({ roto: true })})`;
    expect((await publicContent()).quotes).toEqual(DEFAULT_CONTENT.quotes);
  });

  it("solo el admin edita", async () => {
    const c = await h.caregiver();
    const p = await h.patient({ email: "p@example.org" });
    for (const who of [c, p]) {
      expect((await put(who, "quotes", ["x"])).status).toBe(403);
      expect((await h.req("/admin/content", { as: who })).status).toBe(403);
      expect((await h.req("/admin/content/quotes", { as: who, method: "DELETE" })).status).toBe(
        403,
      );
    }
    expect((await h.req("/admin/content/quotes", { method: "PUT", json: ["x"] })).status).toBe(401);
    expect(await h.sql`select 1 from site_content`).toHaveLength(0);
  });
});

describe("textos originales", () => {
  const text = (v: unknown) => JSON.stringify(v);

  it("cumplen el esquema que valida lo que guarda el admin (se pueden restaurar y volver a guardar)", () => {
    for (const key of CONTENT_KEYS) {
      const r = contentSchemas[key].safeParse(JSON.parse(text(DEFAULT_CONTENT[key])));
      expect(r.success, `${key}: ${r.error?.issues[0]?.message}`).toBe(true);
    }
  });

  it("usan «paciente» y no «persona cuidada»", () => {
    expect(text(DEFAULT_CONTENT)).not.toMatch(/personas? cuidadas?/i);
    expect(DEFAULT_CONTENT.faq.map((f) => f[1]).join(" ")).toContain("en Pacientes");
  });

  it("no describen lo que el código ya no hace: mensajes de contacto guardados, intentos de ingreso, un solo dispositivo", () => {
    const legal = text([DEFAULT_CONTENT.terminos, DEFAULT_CONTENT.privacidad]);
    expect(legal).not.toMatch(/(?<!no )guardamos tu mensaje/i);
    expect(legal).not.toMatch(/intentos de ingreso/i);
    const all = text(DEFAULT_CONTENT);
    expect(all).not.toMatch(/un solo dispositivo|libere tu cuenta|Registrá tu dispositivo/i);
    expect(all).not.toMatch(/Mi perfil › Borrar mi cuenta/);
  });

  it("dicen cómo es el contacto (no se guarda, 3 cada 24 horas), la passkey y los recordatorios", () => {
    const terminos = text(DEFAULT_CONTENT.terminos);
    expect(terminos).toContain("no guardamos tu mensaje");
    expect(terminos).toContain("3 mensajes cada 24 horas");
    expect(terminos).toContain("passkey");
    expect(terminos).toContain("el administrador puede restablecerla");
    expect(terminos).toMatch(/agua y de estiramientos vienen activados/);
    expect(text(DEFAULT_CONTENT.privacidad)).toContain("no guardamos tu mensaje");
  });

  it("la promesa de derechos distingue a cuidadores de pacientes y administradores", () => {
    for (const page of [DEFAULT_CONTENT.terminos, DEFAULT_CONTENT.privacidad]) {
      const t = text(page);
      expect(t).toContain("Si sos cuidador/a, podés ver y corregir tus datos en Mi perfil");
      expect(t).toContain("Si sos paciente o administrador/a, escribinos por Contacto");
    }
  });

  it("Acerca incluye a los pacientes", () => {
    expect(text(DEFAULT_CONTENT.acerca)).toContain("También es para los pacientes");
  });
});
