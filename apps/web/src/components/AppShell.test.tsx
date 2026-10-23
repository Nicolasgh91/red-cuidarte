import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Me } from "../api/types";
import { fakeApi, ok, renderWithApp } from "../test/render";
import { AppShell } from "./AppShell";

const me = (role: Me["role"], profile: Me["profile"]): Me => ({ id: "u1", role, profile });
const quiet = fakeApi({
  me: { patients: { $get: vi.fn(async () => ok({ patients: [] })) } },
  shifts: { $get: vi.fn(async () => ok({ shifts: [] })) },
  tasks: { $get: vi.fn(async () => ok({ date: "x", patients: [] })) },
  admin: {
    summary: {
      $get: vi.fn(async () =>
        ok({
          caregivers: 0,
          patients: 0,
          shifts_this_week: 0,
          blocked_attempts: 0,
          next_birthday: null,
        }),
      ),
    },
    devices: { $get: vi.fn(async () => ok({ devices: [] })) },
  },
});

describe("AppShell", () => {
  beforeEach(() => localStorage.clear());

  it("navegación del cuidador (la misma del prototipo)", async () => {
    renderWithApp(
      <AppShell me={me("caregiver", { first_name: "Sofía", last_names: "Ejemplo" })} />,
      {
        api: quiet,
        route: "/inicio",
      },
    );
    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(nav).toHaveTextContent("InicioTurnosTareasAsistenteBienestarPausaRecursos");
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
  });

  it("navegación del admin y de la persona cuidada", () => {
    const admin = renderWithApp(
      <AppShell me={me("admin", { first_name: "Jorge", last_name: "Ejemplo" })} />,
      {
        api: quiet,
        route: "/admin",
      },
    );
    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveTextContent(
      "PanelCuidadoresPacientesDispositivosCorreos",
    );
    admin.unmount();
  });

  it("el menú de cuenta no tiene selector de rol de demo y sí cerrar sesión y tema", async () => {
    const user = userEvent.setup();
    renderWithApp(
      <AppShell me={me("caregiver", { first_name: "Sofía", last_names: "Ejemplo" })} />,
      {
        api: quiet,
        route: "/inicio",
      },
    );
    await user.click(screen.getByRole("button", { name: /Mi cuenta/ }));
    expect(screen.getByText("Sofía Ejemplo")).toBeVisible();
    expect(screen.getByRole("link", { name: "Mi perfil" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Acerca de Red Cuidar" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Términos y privacidad" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    expect(screen.queryByText(/Ver la app como/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("«Mi perfil» es solo del cuidador", async () => {
    const user = userEvent.setup();
    renderWithApp(<AppShell me={me("admin", { first_name: "Jorge", last_name: "Ejemplo" })} />, {
      api: quiet,
      route: "/admin",
    });
    await user.click(screen.getByRole("button", { name: /Mi cuenta/ }));
    expect(screen.queryByRole("link", { name: "Mi perfil" })).not.toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeVisible();
  });

  it("el tema se guarda por dispositivo en localStorage", async () => {
    const user = userEvent.setup();
    renderWithApp(<AppShell me={me("patient", { first_name: "Elena", last_name: "Ejemplo" })} />, {
      api: fakeApi({}),
      route: "/acerca",
    });
    await user.click(screen.getByRole("button", { name: /Mi cuenta/ }));
    await user.click(screen.getByRole("button", { name: "Oscuro" }));
    expect(localStorage.getItem("cuidarte.theme")).toBe("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await user.click(screen.getByRole("button", { name: "Sistema" }));
    expect(localStorage.getItem("cuidarte.theme")).toBe("system");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("cambiar de sección no rompe la app aunque scrollTo devuelva una Promise", async () => {
    const scrollTo = vi
      .spyOn(window, "scrollTo")
      .mockImplementation((() => Promise.resolve()) as typeof window.scrollTo);
    try {
      const user = userEvent.setup();
      renderWithApp(
        <AppShell me={me("caregiver", { first_name: "Sofía", last_names: "Ejemplo" })} />,
        {
          api: quiet,
          route: "/inicio",
        },
      );
      const nav = screen.getByRole("navigation", { name: "Secciones" });
      await user.click(within(nav).getByRole("link", { name: "Recursos" }));
      expect(screen.getByRole("navigation", { name: "Secciones" })).toBeInTheDocument();
      expect(
        await screen.findByRole("heading", { name: "Cuidarte mientras cuidás" }),
      ).toBeInTheDocument();
    } finally {
      scrollTo.mockRestore();
    }
  });
});
