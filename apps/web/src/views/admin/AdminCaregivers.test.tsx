import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, ok, renderWithApp } from "../../test/render";
import { AdminCaregivers } from "./AdminCaregivers";

const patients = [
  { id: "p1", first_name: "Elena", last_name: "Ejemplo", medications: [], caregiver_ids: ["c1"] },
  { id: "p2", first_name: "Raúl", last_name: "Paz", medications: [], caregiver_ids: [] },
];
const caregivers = [
  {
    id: "c1",
    first_name: "Sofía",
    last_names: "Ejemplo",
    phone: "3421234567",
    email: "sofia@example.org",
    birth_date: "1980-05-14",
    patient_ids: ["p1"],
  },
];

function setup() {
  const put = vi.fn().mockResolvedValue(ok({ ok: true }));
  const api = fakeApi({
    admin: {
      caregivers: {
        $get: vi.fn().mockResolvedValue(ok({ caregivers })),
        ":id": { patients: { $put: put } },
      },
      patients: { $get: vi.fn().mockResolvedValue(ok({ patients })) },
      admins: { $get: vi.fn().mockResolvedValue(ok({ admins: [] })) },
    },
  });
  return { api, put };
}

describe("Admin › Cuidadores", () => {
  let confirm: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => confirm.mockRestore());

  it("usa «Celular» y aclara cómo ingresa quien se agrega", async () => {
    renderWithApp(<AdminCaregivers />, { api: setup().api });
    expect(await screen.findAllByRole("columnheader", { name: "Celular" })).toHaveLength(2);
    expect(screen.getByLabelText("Celular")).toBeInTheDocument();
    expect(screen.queryByText(/Teléfono/)).not.toBeInTheDocument();
    expect(screen.getByText(/«¿Primera vez u olvidaste tu contraseña\?»/)).toBeInTheDocument();
    expect(screen.queryByText(/le llega un código por mail/)).not.toBeInTheDocument();
    expect(screen.getByText("Alta por el equipo técnico")).toBeInTheDocument();
  });

  it("destildar un paciente pide confirmación y avisa que se borran los turnos futuros", async () => {
    const { api, put } = setup();
    const user = userEvent.setup();
    renderWithApp(<AdminCaregivers />, { api });
    const box = (await screen.findAllByRole("checkbox", { name: "Elena Ejemplo" }))[0]!;
    confirm.mockReturnValueOnce(false);
    await user.click(box);
    expect(confirm).toHaveBeenCalledWith(
      "¿Quitar a Elena Ejemplo de Sofía Ejemplo? Se pierde el acceso a su medicación y a sus tareas, y se borran los turnos futuros de este cuidador con ese paciente.",
    );
    expect(put).not.toHaveBeenCalled();
    await user.click(box);
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith({ param: { id: "c1" }, json: { patient_ids: [] } }),
    );
  });

  it("tildar un paciente no pide confirmación", async () => {
    const { api, put } = setup();
    const user = userEvent.setup();
    renderWithApp(<AdminCaregivers />, { api });
    const box = (await screen.findAllByRole("checkbox", { name: "Raúl Paz" }))[0]!;
    await user.click(box);
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith({
        param: { id: "c1" },
        json: { patient_ids: ["p1", "p2"] },
      }),
    );
    expect(confirm).not.toHaveBeenCalled();
  });
});
