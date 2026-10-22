import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("./nav", () => {
  const page = (name: string) => () => <h1>{name}</h1>;
  return {
    HOME: { caregiver: "inicio", admin: "admin", patient: "paciente" },
    VIEWS: {
      caregiver: {
        inicio: page("Inicio cuidador"),
        turnos: page("Turnos"),
        acerca: page("Acerca"),
      },
      admin: {
        admin: page("Panel admin"),
        "admin-dispositivos": page("Dispositivos"),
        acerca: page("Acerca"),
      },
      patient: { paciente: page("Hoy paciente"), acerca: page("Acerca") },
    },
  };
});

import type { Role } from "./api/types";
import { RoleRoutes } from "./RoleRoutes";

function at(role: Role, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RoleRoutes role={role} />
    </MemoryRouter>,
  );
}

describe("rutas protegidas por rol", () => {
  it("cada rol ve sus pantallas", () => {
    at("caregiver", "/turnos");
    expect(screen.getByRole("heading", { name: "Turnos" })).toBeInTheDocument();
  });

  it("la raíz lleva al inicio del rol", () => {
    at("admin", "/");
    expect(screen.getByRole("heading", { name: "Panel admin" })).toBeInTheDocument();
  });

  it("un cuidador no entra a las pantallas de admin: vuelve a su inicio", () => {
    at("caregiver", "/admin-dispositivos");
    expect(screen.getByRole("heading", { name: "Inicio cuidador" })).toBeInTheDocument();
  });

  it("un admin no entra a las de cuidador ni a las de la persona cuidada", () => {
    at("admin", "/turnos");
    expect(screen.getByRole("heading", { name: "Panel admin" })).toBeInTheDocument();
  });

  it("la persona cuidada solo ve Hoy (y las páginas comunes)", () => {
    const { unmount } = at("patient", "/admin");
    expect(screen.getByRole("heading", { name: "Hoy paciente" })).toBeInTheDocument();
    unmount();
    at("patient", "/acerca");
    expect(screen.getByRole("heading", { name: "Acerca" })).toBeInTheDocument();
  });

  it("rutas inexistentes también vuelven al inicio", () => {
    at("patient", "/cualquier-cosa");
    expect(screen.getByRole("heading", { name: "Hoy paciente" })).toBeInTheDocument();
  });

  it("solo el cuidador tiene artículos de recursos", () => {
    at("caregiver", "/recursos/estres");
    expect(screen.getByRole("heading", { name: /estrés/i })).toBeInTheDocument();
  });

  it("un admin que pide un artículo vuelve al panel", () => {
    at("admin", "/recursos/estres");
    expect(screen.getByRole("heading", { name: "Panel admin" })).toBeInTheDocument();
  });
});
