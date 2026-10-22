import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, ok, renderWithApp } from "../../test/render";
import { Bienestar } from "./Bienestar";

function setup(records: unknown[] = [], weeks: unknown[] = []) {
  const post = vi.fn().mockResolvedValue(ok({ id: "r1", at: new Date().toISOString() }));
  const api = fakeApi({
    wellbeing: {
      $get: vi.fn().mockResolvedValue(ok({ records })),
      $post: post,
      weekly: { $get: vi.fn().mockResolvedValue(ok({ weeks })) },
    },
  });
  return { api, post };
}

describe("Bienestar", () => {
  it("no guarda si falta elegir una opción", async () => {
    const { api, post } = setup();
    const user = userEvent.setup();
    renderWithApp(<Bienestar />, { api });
    await user.click(screen.getByRole("button", { name: /Guardar registro/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Elegí una opción en estado emocional, energía y estrés para guardar.",
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("manda las etiquetas elegidas como índices 0–4", async () => {
    const { api, post } = setup();
    const user = userEvent.setup();
    renderWithApp(<Bienestar />, { api });
    await user.click(screen.getByRole("button", { name: "Bien" }));
    await user.click(screen.getByRole("button", { name: "Muy poca" }));
    await user.click(screen.getByRole("button", { name: "Alto" }));
    await user.type(screen.getByLabelText("¿Querés anotar algo?"), "  Día tranquilo  ");
    await user.click(screen.getByRole("button", { name: /Guardar registro/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toEqual({
      json: { mood: 3, energy: 0, stress: 3, note: "Día tranquilo" },
    });
    expect(await screen.findByText("Registro guardado.")).toBeInTheDocument();
  });

  it("historial diario: convierte los números a etiquetas", async () => {
    const { api } = setup([
      {
        id: "r1",
        at: "2026-10-20T20:00:00.000Z",
        mood: 1,
        energy: 2,
        stress: 4,
        note: "Noche difícil",
      },
    ]);
    renderWithApp(<Bienestar />, { api });
    expect(
      await screen.findByText("Ánimo: Bajo · Energía: Media · Estrés: Muy alto"),
    ).toBeInTheDocument();
    expect(screen.getByText("Noche difícil")).toBeInTheDocument();
  });

  it("historial vacío y vista semanal", async () => {
    const empty = setup();
    const user = userEvent.setup();
    const { unmount } = renderWithApp(<Bienestar />, { api: empty.api });
    expect(await screen.findByText(/Todavía no hay registros/)).toBeInTheDocument();
    unmount();

    const { api } = setup(
      [],
      [
        {
          week_start: "2026-10-19",
          count: 2,
          avg_mood: 3.5,
          avg_energy: 1,
          avg_stress: 2,
          mood_by_day: { "2026-10-20": 3, "2026-10-22": 4 },
        },
      ],
    );
    renderWithApp(<Bienestar />, { api });
    await user.click(screen.getByRole("button", { name: "Semanal" }));
    expect(await screen.findByText("Semana del 19 al 25 de octubre")).toBeInTheDocument();
    expect(screen.getByText("2 registros")).toBeInTheDocument();
    expect(screen.getByTitle("Muy bien")).toBeInTheDocument();
    expect(screen.getAllByTitle("Sin registro")).toHaveLength(5);
  });
});
