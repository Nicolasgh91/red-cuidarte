import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { iso } from "../../lib/dates";
import { fakeApi, ok, renderWithApp } from "../../test/render";
import { Tareas } from "./Tareas";

const group = {
  patient: { id: "p1", first_name: "Elena", last_name: "Ejemplo" },
  tasks: [
    { key: "med-m1-08:00", text: "Dar Enalapril 10 mg", time: "08:00", med: true, done: false },
    { key: "t-uuid", text: "Almuerzo", time: "12:30", med: false, done: false },
  ],
};

function api(over: Record<string, unknown> = {}) {
  // El servidor "recuerda" lo tildado: el GET siguiente ya lo trae hecho.
  const done = new Set<string>();
  return fakeApi({
    tasks: {
      $get: vi.fn(async () =>
        ok({
          date: iso(new Date()),
          patients: [
            { ...group, tasks: group.tasks.map((t) => ({ ...t, done: done.has(t.key) })) },
          ],
        }),
      ),
      completions: {
        $post: vi.fn(async ({ json }: { json: { task_key: string } }) => {
          done.add(json.task_key);
          return ok({ ok: true });
        }),
      },
      templates: {
        $post: vi.fn().mockResolvedValue(ok({ id: "nuevo" })),
        ":id": { $delete: vi.fn().mockResolvedValue(ok({ ok: true })) },
      },
      ...over,
    },
  });
}

describe("Tareas", () => {
  it("muestra el checklist por paciente con la medicación marcada", async () => {
    renderWithApp(<Tareas />, { api: api() });
    expect(await screen.findByText("Elena Ejemplo")).toBeInTheDocument();
    expect(screen.getByText("Dar Enalapril 10 mg")).toBeInTheDocument();
    expect(screen.getByText("Medicación")).toBeInTheDocument();
    expect(screen.getByText("0 de 2")).toBeInTheDocument();
  });

  it("tildar una tarea llama a la API con fecha, paciente y clave", async () => {
    const a = api();
    const user = userEvent.setup();
    renderWithApp(<Tareas />, { api: a });
    const boxes = await screen.findAllByRole("checkbox");
    await user.click(boxes[1]!);
    const completions = (
      a as unknown as { tasks: { completions: { $post: ReturnType<typeof vi.fn> } } }
    ).tasks.completions.$post;
    await waitFor(() => expect(completions).toHaveBeenCalledTimes(1));
    expect(completions.mock.calls[0]![0]).toEqual({
      json: { date: iso(new Date()), patient_id: "p1", task_key: "t-uuid", done: true },
    });
    // se refleja enseguida, sin esperar la recarga
    expect(await screen.findByText("1 de 2")).toBeInTheDocument();
  });

  it("agregar una tarea manda texto y horario (opcional)", async () => {
    const a = api();
    const user = userEvent.setup();
    renderWithApp(<Tareas />, { api: a });
    await user.type(
      await screen.findByLabelText("Nueva tarea diaria para Elena Ejemplo"),
      "Regar plantas",
    );
    await user.click(screen.getByRole("button", { name: /Agregar/ }));
    const post = (a as unknown as { tasks: { templates: { $post: ReturnType<typeof vi.fn> } } })
      .tasks.templates.$post;
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toEqual({ json: { patient_id: "p1", text: "Regar plantas" } });
  });

  it("quitar una tarea diaria borra la plantilla por su clave (la de medicación no se puede quitar)", async () => {
    const a = api();
    const user = userEvent.setup();
    renderWithApp(<Tareas />, { api: a });
    const buttons = await screen.findAllByRole("button", { name: "Quitar tarea diaria" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);
    const del = (
      a as unknown as { tasks: { templates: { ":id": { $delete: ReturnType<typeof vi.fn> } } } }
    ).tasks.templates[":id"].$delete;
    await waitFor(() => expect(del).toHaveBeenCalledWith({ param: { id: "t-uuid" } }));
  });

  it("sin pacientes asignados explica qué hacer", async () => {
    renderWithApp(<Tareas />, {
      api: api({ $get: vi.fn().mockResolvedValue(ok({ date: iso(new Date()), patients: [] })) }),
    });
    expect(await screen.findByText(/Todavía no tenés pacientes asignados/)).toBeInTheDocument();
  });
});
