import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, ok, renderWithApp } from "../../test/render";
import { AdminDispositivos } from "./AdminDispositivos";

const devices = [
  {
    id: "u-activo",
    role: "caregiver",
    name: "Sofía Ejemplo",
    label: "Chrome · Android",
    last_ip: "192.0.2.14",
    last_seen_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    blocked: null,
  },
  {
    id: "u-bloqueado",
    role: "caregiver",
    name: "Marta Ejemplo",
    label: "Safari · iPhone",
    last_ip: "198.51.100.7",
    last_seen_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    blocked: { label: "Chrome · Windows", ip: "203.0.113.5", at: new Date().toISOString() },
  },
  {
    id: "u-nuevo",
    role: "patient",
    name: "Elena Ejemplo",
    label: null,
    last_ip: null,
    last_seen_at: null,
    blocked: null,
  },
];

function setup() {
  const release = vi.fn().mockResolvedValue(ok({ ok: true }));
  const authorize = vi.fn().mockResolvedValue(ok({ ok: true }));
  const api = fakeApi({
    admin: {
      devices: {
        $get: vi.fn().mockResolvedValue(ok({ devices })),
        ":id": { release: { $post: release }, authorize: { $post: authorize } },
      },
    },
  });
  return { api, release, authorize };
}

describe("Admin › Dispositivos", () => {
  it("muestra el estado de cada cuenta", async () => {
    renderWithApp(<AdminDispositivos />, { api: setup().api });
    expect(await screen.findByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Intento bloqueado")).toBeInTheDocument();
    expect(screen.getByText("Sin dispositivo")).toBeInTheDocument();
    expect(screen.getByText("Intentó: Chrome · Windows")).toBeInTheDocument();
  });

  it("«Liberar» libera la cuenta indicada", async () => {
    const { api, release } = setup();
    const user = userEvent.setup();
    renderWithApp(<AdminDispositivos />, { api });
    const buttons = await screen.findAllByRole("button", { name: "Liberar" });
    expect(buttons).toHaveLength(2); // activo y bloqueado; el que no tiene dispositivo no
    await user.click(buttons[0]!);
    await waitFor(() => expect(release).toHaveBeenCalledWith({ param: { id: "u-activo" } }));
    expect(
      await screen.findByText("Dispositivo liberado. Se registra uno nuevo en el próximo ingreso."),
    ).toBeInTheDocument();
  });

  it("«Autorizar el nuevo» solo aparece con un intento bloqueado y autoriza esa cuenta", async () => {
    const { api, authorize } = setup();
    const user = userEvent.setup();
    renderWithApp(<AdminDispositivos />, { api });
    const buttons = await screen.findAllByRole("button", { name: "Autorizar el nuevo" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);
    await waitFor(() => expect(authorize).toHaveBeenCalledWith({ param: { id: "u-bloqueado" } }));
    expect(
      await screen.findByText("Nuevo dispositivo autorizado. El anterior quedó sin acceso."),
    ).toBeInTheDocument();
  });
});
