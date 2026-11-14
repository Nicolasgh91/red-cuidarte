import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithApp } from "../test/render";
import { MAX_NAME } from "../lib/validators";
import { LoginScreen, MAX_PASSWORD, RegisterScreen } from "./public";

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

  it("el registro limita el largo de nombre y contraseña y avisa si se pasan", async () => {
    const user = userEvent.setup();
    renderWithApp(<RegisterScreen />, { api });
    const first = screen.getByLabelText("Nombre");
    const pass = screen.getByLabelText("Contraseña");
    expect(first).toHaveAttribute("maxlength", String(MAX_NAME));
    expect(pass).toHaveAttribute("maxlength", String(MAX_PASSWORD));
    // fireEvent esquiva maxLength, como un autocompletado o un pegado del navegador
    fireEvent.change(first, { target: { value: "a".repeat(MAX_NAME + 1) } });
    fireEvent.change(pass, { target: { value: "a".repeat(MAX_PASSWORD + 1) } });
    await user.click(screen.getByRole("button", { name: /Crear cuenta/ }));
    expect(first).toHaveAccessibleDescription(
      `El nombre puede tener hasta ${MAX_NAME} caracteres.`,
    );
    expect(pass).toHaveAccessibleDescription(
      `Al menos 8 caracteres. La contraseña puede tener hasta ${MAX_PASSWORD} caracteres.`,
    );
  });
});
