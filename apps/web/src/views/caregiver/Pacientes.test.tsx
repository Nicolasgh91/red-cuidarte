import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fail, fakeApi, ok, renderWithApp } from "../../test/render";
import { Pacientes } from "./Pacientes";

const elena = {
  id: "p1",
  first_name: "Elena",
  last_name: "Ejemplo",
  medications: [{ id: "m1", name: "Enalapril", dose: "10 mg", times: ["08:00"] }],
};

function api(patients: unknown[], post = vi.fn().mockResolvedValue(ok({ id: "nuevo" }))) {
  return {
    post,
    api: fakeApi({ me: { patients: { $get: vi.fn(async () => ok({ patients })), $post: post } } }),
  };
}

describe("Pacientes", () => {
  it("lista los pacientes con su medicación", async () => {
    renderWithApp(<Pacientes />, { api: api([elena]).api });
    expect(await screen.findByText("Elena Ejemplo")).toBeInTheDocument();
    expect(screen.getByText("Enalapril")).toBeInTheDocument();
    expect(screen.getByText("10 mg")).toBeInTheDocument();
  });

  it("el cuidador carga medicación de un paciente", async () => {
    const medPost = vi.fn().mockResolvedValue(ok({ id: "m2" }));
    const a = fakeApi({
      me: {
        patients: {
          $get: vi.fn(async () => ok({ patients: [elena] })),
          ":id": { medications: { $post: medPost } },
        },
      },
    });
    const user = userEvent.setup();
    renderWithApp(<Pacientes />, { api: a });
    await user.type(await screen.findByLabelText("Medicamento"), "Aspirina");
    await user.type(screen.getByLabelText("Dosis"), "100 mg");
    await user.type(screen.getByLabelText("Horarios"), "09:00, 21:00");
    await user.click(screen.getAllByRole("button", { name: /Agregar/ })[0]!);
    await waitFor(() =>
      expect(medPost).toHaveBeenCalledWith({
        param: { id: "p1" },
        json: { name: "Aspirina", dose: "100 mg", times: ["09:00", "21:00"] },
      }),
    );
  });

  it("el cuidador quita un medicamento", async () => {
    const del = vi.fn().mockResolvedValue(ok({ ok: true }));
    const a = fakeApi({
      me: {
        patients: { $get: vi.fn(async () => ok({ patients: [elena] })) },
        medications: { ":id": { $delete: del } },
      },
    });
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    renderWithApp(<Pacientes />, { api: a });
    const quitar = await screen.findByRole("button", { name: "Quitar Enalapril" });
    // Sin confirmar no se borra nada.
    confirm.mockReturnValueOnce(false);
    await user.click(quitar);
    expect(confirm).toHaveBeenCalledWith(
      "¿Quitar Enalapril? Se borra de la ficha y de las tareas de hoy.",
    );
    expect(del).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    await user.click(quitar);
    await waitFor(() => expect(del).toHaveBeenCalledWith({ param: { id: "m1" } }));
    confirm.mockRestore();
  });

  it("sin pacientes invita a agregar el primero", async () => {
    renderWithApp(<Pacientes />, { api: api([]).api });
    expect(await screen.findByText(/Todavía no tenés pacientes/)).toBeInTheDocument();
  });

  it("el cuidador da de alta a un paciente y la API recibe sus datos", async () => {
    const { api: a, post } = api([]);
    const user = userEvent.setup();
    renderWithApp(<Pacientes />, { api: a });
    await user.type(await screen.findByLabelText("Nombre"), " Raúl ");
    await user.type(screen.getByLabelText("Apellido"), "Paz");
    await user.click(screen.getByRole("button", { name: /Agregar/ }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({ json: { first_name: "Raúl", last_name: "Paz" } }),
    );
    expect(await screen.findByText("Paciente agregado.")).toBeInTheDocument();
  });

  it("valida los campos y muestra el error de mail repetido", async () => {
    const post = vi
      .fn()
      .mockResolvedValue(fail(409, "email_taken", "Ya hay una cuenta con ese mail."));
    const { api: a } = api([], post);
    const user = userEvent.setup();
    renderWithApp(<Pacientes />, { api: a });
    await user.click(await screen.findByRole("button", { name: /Agregar/ }));
    expect(screen.getByText("Falta el nombre.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Nombre"), "Raúl");
    await user.type(screen.getByLabelText("Apellido"), "Paz");
    await user.type(screen.getByLabelText(/Mail/), "raul@example.org");
    await user.click(screen.getByRole("button", { name: /Agregar/ }));
    expect(await screen.findByText("Ya hay una cuenta con ese mail.")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith({
      json: { first_name: "Raúl", last_name: "Paz", email: "raul@example.org" },
    });
  });

  it("vincula a un paciente con su código", async () => {
    const link = vi.fn().mockResolvedValue(ok({ id: "p9" }));
    const a = fakeApi({
      me: { patients: { $get: vi.fn(async () => ok({ patients: [] })), link: { $post: link } } },
    });
    const user = userEvent.setup();
    renderWithApp(<Pacientes />, { api: a });
    await user.type(await screen.findByLabelText("Código"), "abcd-2345");
    await user.click(screen.getByRole("button", { name: /Vincular/ }));
    await waitFor(() => expect(link).toHaveBeenCalledWith({ json: { code: "abcd-2345" } }));
    expect(await screen.findByText("Listo, paciente vinculado.")).toBeInTheDocument();
  });

  it("muestra el error de un código inválido", async () => {
    const link = vi
      .fn()
      .mockResolvedValue(fail(404, "not_found", "Ese código no existe o ya venció."));
    const a = fakeApi({
      me: { patients: { $get: vi.fn(async () => ok({ patients: [] })), link: { $post: link } } },
    });
    const user = userEvent.setup();
    renderWithApp(<Pacientes />, { api: a });
    await user.click(await screen.findByRole("button", { name: /Vincular/ }));
    expect(screen.getByText("Escribí el código.")).toBeInTheDocument();
    expect(link).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Código"), "ZZZZZZZZ");
    await user.click(screen.getByRole("button", { name: /Vincular/ }));
    expect(await screen.findByText("Ese código no existe o ya venció.")).toBeInTheDocument();
  });
});
