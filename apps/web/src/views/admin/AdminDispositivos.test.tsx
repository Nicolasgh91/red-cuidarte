import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fail, fakeApi, ok, renderWithApp } from "../../test/render";
import { AdminDispositivos } from "./AdminDispositivos";

const devices = [
  {
    id: "u-sincronizada",
    role: "caregiver",
    name: "Sofía Ejemplo",
    label: "Chrome · Android",
    last_ip: "192.0.2.14",
    last_seen_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    registered_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    device_type: "multiDevice",
    backed_up: true,
  },
  {
    id: "u-local",
    role: "caregiver",
    name: "Marta Ejemplo",
    label: "Safari · iPhone",
    last_ip: "198.51.100.7",
    last_seen_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    registered_at: new Date().toISOString(),
    device_type: "singleDevice",
    backed_up: false,
  },
  {
    id: "u-nuevo",
    role: "patient",
    name: "Elena Ejemplo",
    label: null,
    last_ip: null,
    last_seen_at: null,
    registered_at: null,
    device_type: null,
    backed_up: null,
  },
];

function setup() {
  const release = vi.fn().mockResolvedValue(ok({ ok: true }));
  const api = fakeApi({
    admin: {
      devices: {
        $get: vi.fn().mockResolvedValue(ok({ devices })),
        ":id": { release: { $post: release } },
      },
    },
  });
  return { api, release };
}

describe("Admin › Passkeys", () => {
  it("muestra el estado y las marcas de sincronización y respaldo", async () => {
    renderWithApp(<AdminDispositivos />, { api: setup().api });
    expect(await screen.findAllByText("Activa")).toHaveLength(2);
    expect(screen.getByText("Sin passkey")).toBeInTheDocument();
    // «Sincronizable» y «Con respaldo» no significan lo mismo: se muestran por separado
    expect(screen.getAllByText("Sincronizable")).toHaveLength(1);
    expect(screen.getAllByText("Con respaldo")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Autorizar/ })).not.toBeInTheDocument();
  });

  it("«Restablecer passkey» restablece y avisa", async () => {
    const { api, release } = setup();
    const user = userEvent.setup();
    renderWithApp(<AdminDispositivos />, { api });
    const buttons = await screen.findAllByRole("button", { name: "Restablecer passkey" });
    expect(buttons).toHaveLength(2); // la cuenta sin passkey no tiene el botón
    await user.click(buttons[0]!);
    await waitFor(() => expect(release).toHaveBeenCalledWith({ param: { id: "u-sincronizada" } }));
    expect(
      await screen.findByText("Passkey restablecida. Se registra una nueva en el próximo ingreso."),
    ).toBeInTheDocument();
  });

  it("si la API falla, muestra el motivo", async () => {
    const { api, release } = setup();
    release.mockResolvedValue(fail(404, "not_found", "Esa cuenta no tiene una passkey registrada."));
    const user = userEvent.setup();
    renderWithApp(<AdminDispositivos />, { api });
    await user.click((await screen.findAllByRole("button", { name: "Restablecer passkey" }))[0]!);
    expect(
      await screen.findByText("Esa cuenta no tiene una passkey registrada."),
    ).toBeInTheDocument();
  });
});
