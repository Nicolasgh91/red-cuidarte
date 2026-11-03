import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithApp } from "../test/render";
import { LoginScreen, RegisterScreen } from "./public";

const api = fakeApi({ me: vi.fn() });

describe("pantallas públicas", () => {
  it("tienen un enlace para saltar al contenido", () => {
    renderWithApp(<LoginScreen error={null} />, { api });
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toHaveAttribute(
      "href",
      "#main",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("el error de un campo queda enlazado al control y lo marca como inválido", async () => {
    const user = userEvent.setup();
    renderWithApp(<RegisterScreen />, { api });
    await user.click(screen.getByRole("button", { name: /Crear cuenta/ }));
    const first = screen.getByLabelText("Nombre");
    expect(first).toHaveAttribute("aria-invalid", "true");
    expect(first).toHaveAccessibleDescription("Escribí tu nombre.");
    // con pista y error, la descripción trae las dos
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Contraseña")).toHaveAccessibleDescription(
      "Al menos 8 caracteres. La contraseña tiene que tener al menos 8 caracteres.",
    );
  });
});
