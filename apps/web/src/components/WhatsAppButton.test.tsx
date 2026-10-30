import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WHATSAPP_GREETING, WhatsAppButton } from "./WhatsAppButton";

const href = `https://wa.me/5491130428741?text=${encodeURIComponent(WHATSAPP_GREETING)}`;

describe("botón de WhatsApp", () => {
  it("al cuidador le muestra el enlace a WhatsApp con el saludo", () => {
    render(<WhatsAppButton role="caregiver" />);
    const link = screen.getByRole("link", { name: "Escribinos por WhatsApp" });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("al paciente también le muestra el enlace", () => {
    render(<WhatsAppButton role="patient" />);
    expect(screen.getByRole("link", { name: "Escribinos por WhatsApp" })).toHaveAttribute(
      "href",
      href,
    );
  });

  it("al administrador no le muestra nada", () => {
    const { container } = render(<WhatsAppButton role="admin" />);
    expect(container).toBeEmptyDOMElement();
  });
});
