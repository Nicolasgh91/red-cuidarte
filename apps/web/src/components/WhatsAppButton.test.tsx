import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WhatsAppButton } from "./WhatsAppButton";

describe("WhatsAppButton", () => {
  it.each(["caregiver", "patient"] as const)(
    "el rol %s lo ve y su nombre avisa que abre otra pestaña",
    (role) => {
      render(<WhatsAppButton role={role} />);
      const link = screen.getByRole("link", { name: /Escribinos por WhatsApp/ });
      expect(link).toHaveAccessibleName("Escribinos por WhatsApp (se abre en una pestaña nueva)");
      expect(link).toHaveAttribute("target", "_blank");
    },
  );

  it("el admin no lo ve", () => {
    render(<WhatsAppButton role="admin" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
