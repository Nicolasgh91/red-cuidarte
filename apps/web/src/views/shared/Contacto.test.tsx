import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fail, fakeApi, ok, renderWithApp } from "../../test/render";
import { Contacto } from "./Contacto";

const api = (post = vi.fn().mockResolvedValue(ok({ ok: true }))) =>
  Object.assign(fakeApi({ contact: { $post: post } }), { post });

describe("Contacto", () => {
  it("muestra el mail de contacto como mailto y el aviso de no incluir datos de salud", () => {
    renderWithApp(<Contacto />, { api: api() });
    expect(screen.getByRole("link", { name: "info@redasistir.online" })).toHaveAttribute(
      "href",
      "mailto:info@redasistir.online",
    );
    expect(
      screen.getByText("No incluyas datos de salud ni de medicación en este mensaje."),
    ).toBeInTheDocument();
  });

  it("no manda un mensaje vacío", async () => {
    const a = api();
    const user = userEvent.setup();
    renderWithApp(<Contacto />, { api: a });
    await user.type(screen.getByLabelText("Mensaje"), "   ");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribí tu mensaje.");
    expect(a.post).not.toHaveBeenCalled();
  });

  it("limita el asunto a 100 y el mensaje a 2000 caracteres", () => {
    renderWithApp(<Contacto />, { api: api() });
    expect(screen.getByLabelText("Asunto (opcional)")).toHaveAttribute("maxlength", "100");
    expect(screen.getByLabelText("Mensaje")).toHaveAttribute("maxlength", "2000");
  });

  it("envía asunto y mensaje y muestra la confirmación", async () => {
    const a = api();
    const user = userEvent.setup();
    renderWithApp(<Contacto />, { api: a });
    await user.type(screen.getByLabelText("Asunto (opcional)"), " Una consulta ");
    await user.type(screen.getByLabelText("Mensaje"), "Hola, necesito ayuda");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    await waitFor(() =>
      expect(a.post).toHaveBeenCalledWith({
        json: { subject: "Una consulta", message: "Hola, necesito ayuda" },
      }),
    );
    expect(await screen.findByText("Listo, recibimos tu mensaje.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Escribir otro mensaje" }));
    expect(screen.getByLabelText("Mensaje")).toHaveValue("");
  });

  it.each([
    [
      429,
      "rate_limited",
      "Ya mandaste 3 mensajes en las últimas 24 horas. Probá de nuevo más tarde.",
    ],
    [
      502,
      "mail_failed",
      "No pudimos enviar tu mensaje ahora. Probá de nuevo en un rato.",
    ],
  ])(
    "error %i: muestra el mensaje del servidor y conserva lo escrito",
    async (status, code, msg) => {
      const a = api(vi.fn().mockResolvedValue(fail(status, code, msg)));
      const user = userEvent.setup();
      renderWithApp(<Contacto />, { api: a });
      await user.type(screen.getByLabelText("Mensaje"), "Hola");
      await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(msg);
      expect(screen.getByLabelText("Mensaje")).toHaveValue("Hola");
    },
  );
});
