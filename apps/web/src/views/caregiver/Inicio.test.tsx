import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, ok, renderWithApp } from "../../test/render";
import { Inicio } from "./Inicio";

const elena = { id: "p1", first_name: "Elena", last_name: "Ejemplo", medications: [] };

function api(patients: unknown[]) {
  return fakeApi({
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
    shifts: { $get: vi.fn(async () => ok({ shifts: [] })) },
    tasks: { $get: vi.fn(async () => ok({ date: "2026-10-21", patients: [] })) },
  });
}

describe("Inicio (cuidador)", () => {
  it("saluda con un tono sereno", async () => {
    renderWithApp(<Inicio />, { api: api([elena]) });
    expect(await screen.findByRole("heading", { name: "Un momento para vos" })).toBeInTheDocument();
    expect(screen.getByText("Empecemos el día con calma.")).toBeInTheDocument();
    expect(await screen.findByText("Hola, Sofía")).toBeInTheDocument();
  });

  it("sin pacientes invita a agregar o vincular el primero, y no habla de turnos ni tareas", async () => {
    renderWithApp(<Inicio />, { api: api([]) });
    const cta = await screen.findByRole("link", { name: "Agregá o vinculá a tu primer paciente" });
    expect(cta).toHaveAttribute("href", "/pacientes");
    expect(screen.getByText("Todavía no tenés pacientes")).toBeInTheDocument();
    expect(screen.queryByText("Sin tareas para hoy.")).not.toBeInTheDocument();
    expect(screen.queryByText(/No tenés turnos cargados/)).not.toBeInTheDocument();
  });

  it("con pacientes pero sin turnos ni tareas, lo dice por separado", async () => {
    renderWithApp(<Inicio />, { api: api([elena]) });
    expect(await screen.findByText("Sin tareas para hoy.")).toBeInTheDocument();
    expect(
      screen.getByText("No tenés turnos cargados. Contáselos al asistente."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Agregá o vinculá a tu primer paciente" }),
    ).not.toBeInTheDocument();
  });

  it("usa los nombres del glosario en los accesos", async () => {
    renderWithApp(<Inicio />, { api: api([elena]) });
    expect(await screen.findByText("Pacientes", { selector: ".card-title" })).toBeInTheDocument();
    expect(screen.queryByText(/Personas cuidadas/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ritual de desconexión" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrar cómo estoy…" })).toBeInTheDocument();
  });
});
