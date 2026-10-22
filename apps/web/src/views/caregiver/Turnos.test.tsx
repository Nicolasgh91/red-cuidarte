import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fail, fakeApi, ok, renderWithApp } from "../../test/render";
import { iso, monday } from "../../lib/dates";
import { Turnos } from "./Turnos";

const patients = [
  { id: "p1", first_name: "Elena", last_name: "Ejemplo", medications: [] },
  { id: "p2", first_name: "Raúl", last_name: "Ejemplo", medications: [] },
];

function api(over: { post?: unknown; del?: unknown; shifts?: unknown[] } = {}) {
  const mon = iso(monday(new Date()));
  return fakeApi({
    me: { patients: { $get: vi.fn().mockResolvedValue(ok({ patients })) } },
    shifts: {
      $get: vi.fn().mockResolvedValue(
        ok({
          shifts: over.shifts ?? [
            {
              id: "s1",
              caregiver_id: "c1",
              patient_id: "p1",
              date: mon,
              start: "08:00",
              end: "14:00",
              source: "manual",
            },
            {
              id: "s2",
              caregiver_id: "c1",
              patient_id: "p2",
              date: mon,
              start: "20:00",
              end: "02:00",
              source: "assistant",
            },
          ],
        }),
      ),
      $post: over.post ?? vi.fn(),
      ":id": { $delete: over.del ?? vi.fn() },
    },
  });
}

describe("Turnos", () => {
  it("lista los turnos de la semana con paciente, horario y marca del asistente", async () => {
    renderWithApp(<Turnos />, { api: api() });
    expect(await screen.findByText("08:00–14:00")).toBeInTheDocument();
    expect(screen.getByText("20:00–02:00 (+1)")).toBeInTheDocument();
    expect(screen.getByText("Asistente")).toBeInTheDocument();
    expect(screen.getByText("Elena Ejemplo", { selector: ".who" })).toBeInTheDocument();
    expect(screen.getByText("12 h esta semana")).toBeInTheDocument();
  });

  it("muestra el mensaje del servidor cuando el turno se superpone (409)", async () => {
    const post = vi
      .fn()
      .mockResolvedValue(
        fail(409, "overlap", "Se superpone con tu turno del lunes 19 de octubre de 08:00 a 14:00."),
      );
    const user = userEvent.setup();
    renderWithApp(<Turnos />, { api: api({ post }) });
    await screen.findByLabelText("Paciente");

    await user.click(screen.getByRole("button", { name: /Agregar turno/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Se superpone con tu turno del lunes 19 de octubre de 08:00 a 14:00.",
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toMatchObject({
      json: { patient_id: "p1", start: "08:00", end: "14:00", repeat_weeks: 1 },
    });
  });

  it("valida en el cliente: mismo horario de inicio y fin", async () => {
    const post = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<Turnos />, { api: api({ post }) });
    const end = await screen.findByLabelText("Hasta");
    await user.clear(end);
    await user.type(end, "08:00");
    await user.click(screen.getByRole("button", { name: /Agregar turno/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El turno no puede empezar y terminar a la misma hora.",
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("repetir por 4 semanas manda repeat_weeks y avisa cuántos turnos se agregaron", async () => {
    const created = Array.from({ length: 4 }, (_, i) => ({ id: `n${i}` }));
    const post = vi.fn().mockResolvedValue(ok({ shifts: created }));
    const user = userEvent.setup();
    renderWithApp(<Turnos />, { api: api({ post }) });
    await user.selectOptions(await screen.findByLabelText("Repetir"), "4");
    await user.click(screen.getByRole("button", { name: /Agregar turno/ }));
    expect(await screen.findByText("4 turnos agregados.")).toBeInTheDocument();
    expect(post.mock.calls[0]![0]).toMatchObject({ json: { repeat_weeks: 4 } });
  });

  it("borrar un turno y Deshacer lo vuelve a crear", async () => {
    const del = vi.fn().mockResolvedValue(ok({ ok: true }));
    const post = vi.fn().mockResolvedValue(ok({ shifts: [{ id: "nuevo" }] }));
    const user = userEvent.setup();
    renderWithApp(<Turnos />, { api: api({ del, post }) });
    const buttons = await screen.findAllByRole("button", { name: "Borrar turno" });
    await user.click(buttons[0]!);
    await waitFor(() => expect(del).toHaveBeenCalledWith({ param: { id: "s1" } }));
    await user.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toMatchObject({
      json: { patient_id: "p1", start: "08:00", end: "14:00", repeat_weeks: 1 },
    });
  });
});
