import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as demo from "../auth/demo";
import { fakeApi, ok, renderWithApp } from "../test/render";
import { DemoBar } from "./DemoBar";

const users = [
  { id: "a1", role: "admin", name: "Ana Administradora", email: null },
  { id: "c1", role: "caregiver", name: "Carla Cuidadora", email: null },
  { id: "p1", role: "patient", name: "Pedro Paciente", email: null },
];
const me = {
  id: "a1",
  role: "admin" as const,
  profile: { first_name: "Ana", last_name: "Administradora" },
};

afterEach(() => vi.restoreAllMocks());

describe("barra del modo demo", () => {
  it("muestra con quién se está viendo y lista a todos los usuarios por rol", async () => {
    const api = fakeApi({ demo: { users: { $get: async () => ok({ users }) } } });
    renderWithApp(<DemoBar me={me} />, { api });
    expect(screen.getByText(/Estás como Ana Administradora \(Administrador\)/)).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Carla Cuidadora" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pedro Paciente" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Cambiar usuario" })).toHaveValue("a1");
  });

  it("elegir otro usuario cambia la sesión demo", async () => {
    const api = fakeApi({ demo: { users: { $get: async () => ok({ users }) } } });
    const spy = vi.spyOn(demo, "switchDemoUser").mockImplementation(() => undefined);
    renderWithApp(<DemoBar me={me} />, { api });
    await screen.findByRole("option", { name: "Carla Cuidadora" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Cambiar usuario" }), "c1");
    expect(spy).toHaveBeenCalledWith("c1");
  });
});

describe("switchDemoUser", () => {
  it("guarda el usuario elegido y recarga desde el inicio", async () => {
    const reload = vi.fn();
    demo.switchDemoUser("c1", reload);
    expect(reload).toHaveBeenCalledWith("/");
    expect(await demo.demoServices.getAccessToken()).toBe("demo:c1");
    demo.setDemoUser(null);
  });
});
