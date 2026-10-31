import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Blocks } from "./Blocks";

describe("Blocks", () => {
  it("muestra párrafos, subtítulos y listas, y vuelve enlaces los mails", () => {
    render(
      <Blocks
        blocks={[
          ["h", "Contacto"],
          ["p", "Escribinos a info@redasistir.online cuando quieras."],
          ["ul", ["uno", "dos"]],
        ]}
        leadClass="lead"
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Contacto" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "info@redasistir.online" })).toHaveAttribute(
      "href",
      "mailto:info@redasistir.online",
    );
    expect(screen.getByText(/Escribinos a/)).toHaveClass("lead");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("usa el nivel de subtítulo pedido y no ejecuta HTML", () => {
    render(
      <Blocks
        heading="h3"
        blocks={[
          ["h", "Sub"],
          ["p", "<b>no</b> <script>x</script>"],
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Sub" })).toBeInTheDocument();
    expect(screen.getByText("<b>no</b> <script>x</script>")).toBeInTheDocument();
  });
});
