import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Privacidad } from "./Privacidad";

describe("Privacidad", () => {
  it("es pública (no necesita sesión) y declara el envío de mensajes del asistente a Groq", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Privacidad />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Política de privacidad" })).toBeInTheDocument();
    expect(screen.getByText(/se envían a\s+Groq/)).toBeInTheDocument();
    expect(screen.getByText(/borrar tu cuenta/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "info@redasistir.online" })[0]).toHaveAttribute(
      "href",
      "mailto:info@redasistir.online",
    );
    expect(screen.getByText(/formulario de Contacto/)).toBeInTheDocument();
  });
});
