import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTENT } from "../../content";
import { Acerca } from "../../views/shared/Acerca";

const original = window.fetch;
afterEach(() => {
  window.fetch = original;
});

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Acerca />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("contenido público", () => {
  it("muestra el texto original mientras no llega nada o si falla la red", async () => {
    view();
    expect(
      await screen.findByRole("heading", { name: DEFAULT_CONTENT.acerca.title }),
    ).toBeInTheDocument();
  });

  it("muestra lo que editó el admin, sin pedir sesión", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      Response.json({ acerca: { title: "Quiénes somos", blocks: [["p", "Texto del admin."]] } }),
    );
    window.fetch = fetchMock as unknown as typeof window.fetch;
    view();
    expect(await screen.findByRole("heading", { name: "Quiénes somos" })).toBeInTheDocument();
    expect(screen.getByText("Texto del admin.")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/content$/);
  });
});
