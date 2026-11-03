import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DISCLAIMER } from "../../lib/labels";
import { fakeApi, ok, renderWithApp } from "../../test/render";
import { Asistente } from "./Asistente";

function api(patients: unknown[], chat?: unknown) {
  return fakeApi({
    ...(chat ? { assistant: { chat: { $post: chat } } } : {}),
    me: {
      $get: vi.fn(async () =>
        ok({
          id: "c1",
          role: "caregiver",
          profile: { first_name: "Sofía", last_names: "Ejemplo" },
        }),
      ),
      patients: { $get: vi.fn(async () => ok({ patients })) },
    },
  });
}

describe("Asistente", () => {
  it("las sugerencias usan el nombre del primer paciente asignado", async () => {
    const elena = { id: "p1", first_name: "Elena", last_name: "Ejemplo", medications: [] };
    renderWithApp(<Asistente />, { api: api([elena]) });
    expect(
      await screen.findByRole("button", {
        name: "La semana que viene trabajo lunes y miércoles de 8 a 14 con Elena",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /¿Cómo ayudo a Elena a pararse/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Me siento sin energía, ¿qué puedo hacer hoy?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/agotada/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Agregá o vinculá/ })).not.toBeInTheDocument();
  });

  it("sin pacientes usa un texto genérico y avisa que primero hace falta uno", async () => {
    renderWithApp(<Asistente />, { api: api([]) });
    const link = await screen.findByRole("link", { name: "Agregá o vinculá a uno" });
    expect(link).toHaveAttribute("href", "/pacientes");
    expect(
      screen.getByText(/Para cargar turnos primero necesitás un paciente/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "La semana que viene trabajo lunes y miércoles de 8 a 14 con mi paciente",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Elena|Raúl/ })).not.toBeInTheDocument();
  });

  it("muestra el aviso legal en la pantalla", async () => {
    renderWithApp(<Asistente />, { api: api([]) });
    expect(await screen.findByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("una respuesta de urgencia se avisa con rol de alerta y trae el enlace para llamar", async () => {
    const chat = vi.fn(async () =>
      ok({ reply: "Llamá ya al SAME 107. Quedate con la persona.", added: [], urgent: true }),
    );
    const user = userEvent.setup();
    renderWithApp(<Asistente />, { api: api([], chat) });

    await user.type(await screen.findByLabelText("Mensaje"), "se desmayó y no respira");
    await user.click(screen.getByRole("button", { name: /Enviar/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Llamá ya al SAME 107");
    expect(screen.getByRole("link", { name: "Llamar al 107" })).toHaveAttribute("href", "tel:107");
  });

  it("una respuesta normal no lleva el botón de llamada", async () => {
    const chat = vi.fn(async () =>
      ok({ reply: "Hola, ¿en qué te ayudo?", added: [], urgent: false }),
    );
    const user = userEvent.setup();
    renderWithApp(<Asistente />, { api: api([], chat) });

    await user.type(await screen.findByLabelText("Mensaje"), "hola");
    await user.click(screen.getByRole("button", { name: /Enviar/ }));

    expect(await screen.findByText("Hola, ¿en qué te ayudo?")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Llamar al/ })).not.toBeInTheDocument();
  });
});
