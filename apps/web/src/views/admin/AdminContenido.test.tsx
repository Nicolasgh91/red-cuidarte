import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTENT } from "../../content";
import { fail, fakeApi, ok, renderWithApp } from "../../test/render";
import { AdminContenido } from "./AdminContenido";

function api(custom: string[] = [], put = vi.fn().mockResolvedValue(ok({ ok: true }))) {
  const del = vi.fn().mockResolvedValue(ok({ ok: true }));
  return {
    put,
    del,
    api: fakeApi({
      admin: {
        content: {
          $get: vi.fn(async () => ok({ content: DEFAULT_CONTENT, custom })),
          ":key": { $put: put, $delete: del },
        },
      },
    }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("AdminContenido", () => {
  it("edita las frases (una por línea) y las guarda", async () => {
    const { api: a, put } = api();
    const user = userEvent.setup();
    renderWithApp(<AdminContenido />, { api: a });
    const box = await screen.findByLabelText("Frases");
    await user.clear(box);
    await user.type(box, "Primera frase.{enter}{enter}  Segunda frase.  {enter}");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith({
        param: { key: "quotes" },
        json: ["Primera frase.", "Segunda frase."],
      }),
    );
    expect(await screen.findByText("Guardado. Ya se ve en la web.")).toBeInTheDocument();
  });

  it("muestra el error de la API si no se puede guardar", async () => {
    const put = vi.fn().mockResolvedValue(fail(400, "invalid_input", "Dejá al menos una frase."));
    const user = userEvent.setup();
    renderWithApp(<AdminContenido />, { api: api([], put).api });
    await user.clear(await screen.findByLabelText("Frases"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Dejá al menos una frase.")).toBeInTheDocument();
  });

  it("solo ofrece volver al texto original si ya está editado, y lo pide confirmado", async () => {
    const plain = api();
    const first = renderWithApp(<AdminContenido />, { api: plain.api });
    await screen.findByLabelText("Frases");
    expect(screen.queryByRole("button", { name: "Volver al texto original" })).toBeNull();
    first.unmount();

    const edited = api(["quotes"]);
    const user = userEvent.setup();
    renderWithApp(<AdminContenido />, { api: edited.api });
    const restore = await screen.findByRole("button", { name: "Volver al texto original" });
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(restore);
    expect(edited.del).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await user.click(restore);
    await waitFor(() => expect(edited.del).toHaveBeenCalledWith({ param: { key: "quotes" } }));
  });

  it("edita un recurso: el texto se convierte en párrafos, subtítulos y listas", async () => {
    const { api: a, put } = api();
    const user = userEvent.setup();
    renderWithApp(<AdminContenido />, { api: a });
    await user.click(await screen.findByRole("tab", { name: "Recursos" }));
    const title = await screen.findByLabelText("Título");
    await user.clear(title);
    await user.type(title, "Título editado");
    const body = screen.getByLabelText("Contenido");
    await user.clear(body);
    await user.type(body, "Intro.{enter}{enter}## Sub{enter}{enter}- uno{enter}- dos");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const sent = put.mock.calls[0]![0] as {
      param: { key: string };
      json: { id: string; title: string; body: unknown }[];
    };
    expect(sent.param).toEqual({ key: "articles" });
    expect(sent.json).toHaveLength(DEFAULT_CONTENT.articles.length);
    expect(sent.json[0]).toMatchObject({
      id: DEFAULT_CONTENT.articles[0]!.id,
      title: "Título editado",
      body: [
        ["p", "Intro."],
        ["h", "Sub"],
        ["ul", ["uno", "dos"]],
      ],
    });
  });

  it("agrega un recurso nuevo con identificador propio", async () => {
    const { api: a, put } = api();
    const user = userEvent.setup();
    renderWithApp(<AdminContenido />, { api: a });
    await user.click(await screen.findByRole("tab", { name: "Recursos" }));
    await user.click(await screen.findByRole("button", { name: /Nuevo recurso/ }));
    await user.type(screen.getByLabelText("Título"), "Cuidar la espalda");
    await user.type(screen.getByLabelText("Descripción corta"), "Posturas.");
    await user.type(screen.getByLabelText("Contenido"), "Doblá las rodillas.");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const list = (put.mock.calls[0]![0] as { json: { id: string; title: string }[] }).json;
    expect(list).toHaveLength(DEFAULT_CONTENT.articles.length + 1);
    expect(list.at(-1)).toMatchObject({ title: "Cuidar la espalda", cat: "Salud mental" });
    expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
  });

  it("edita las preguntas frecuentes y las páginas", async () => {
    const { api: a, put } = api(["acerca"]);
    const user = userEvent.setup();
    renderWithApp(<AdminContenido />, { api: a });
    await user.click(await screen.findByRole("tab", { name: "Preguntas frecuentes" }));
    const q = await screen.findByLabelText("Pregunta 1");
    await user.clear(q);
    await user.type(q, "¿Nueva?");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const faq = put.mock.calls[0]![0] as { param: { key: string }; json: string[][] };
    expect(faq.param.key).toBe("faq");
    expect(faq.json[0]![0]).toBe("¿Nueva?");

    await user.click(screen.getByRole("tab", { name: "Páginas" }));
    const page = await screen.findByLabelText("Página");
    expect(within(page).getByRole("option", { name: "Acerca de (editada)" })).toBeInTheDocument();
    const t = await screen.findByLabelText("Título");
    await user.clear(t);
    await user.type(t, "Quiénes somos");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1]![0]).toMatchObject({
      param: { key: "acerca" },
      json: { title: "Quiénes somos" },
    });
  });

  it("edita la landing: lema y pasos", async () => {
    const { api: a, put } = api();
    const user = userEvent.setup();
    renderWithApp(<AdminContenido />, { api: a });
    await user.click(await screen.findByRole("tab", { name: "Landing" }));
    const tag = await screen.findByLabelText("Lema");
    await user.clear(tag);
    await user.type(tag, "Lema nuevo");
    await user.click(screen.getByRole("button", { name: "Quitar paso 3" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const sent = put.mock.calls[0]![0] as {
      param: { key: string };
      json: { tagline: string; steps: unknown[] };
    };
    expect(sent.param.key).toBe("landing");
    expect(sent.json.tagline).toBe("Lema nuevo");
    expect(sent.json.steps).toHaveLength(DEFAULT_CONTENT.landing.steps.length - 1);
  });
});
