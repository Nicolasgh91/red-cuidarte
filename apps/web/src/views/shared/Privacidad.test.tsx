import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Privacidad } from "./Privacidad";

describe("Privacidad", () => {
  it("es pública (no necesita sesión) y declara el envío de mensajes del asistente a Groq", () => {
    render(
      <MemoryRouter>
        <Privacidad />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Política de privacidad" })).toBeInTheDocument();
    expect(screen.getByText(/se envían a\s+Groq/)).toBeInTheDocument();
    expect(screen.getByText(/borrar tu cuenta/)).toBeInTheDocument();
  });
});
