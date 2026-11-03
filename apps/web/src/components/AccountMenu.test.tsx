import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithApp } from "../test/render";
import { AccountMenu } from "./AccountMenu";

describe("AccountMenu", () => {
  it("el botón se llama «Mi cuenta» y el panel acompaña su estado", async () => {
    const user = userEvent.setup();
    renderWithApp(<AccountMenu role="caregiver" name="Alguien" />, {
      api: fakeApi({ me: vi.fn() }),
    });
    const btn = screen.getByRole("button", { name: "Mi cuenta" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Menú de cuenta" })).not.toBeInTheDocument();
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: "Menú de cuenta" });
    expect(btn).toHaveAttribute("aria-controls", panel.id);
  });

  it.each(["caregiver", "admin", "patient"] as const)(
    "el rol %s tiene el enlace a Privacidad",
    (role) => {
      renderWithApp(<AccountMenu role={role} name="Alguien" />, { api: fakeApi({ me: vi.fn() }) });
      expect(screen.getByRole("link", { name: "Privacidad", hidden: true })).toHaveAttribute(
        "href",
        "/privacidad",
      );
    },
  );

  it.each(["caregiver", "admin", "patient"] as const)(
    "el rol %s tiene el enlace a Contacto",
    (role) => {
      renderWithApp(<AccountMenu role={role} name="Alguien" />, { api: fakeApi({ me: vi.fn() }) });
      expect(screen.getByRole("link", { name: "Contacto", hidden: true })).toHaveAttribute(
        "href",
        "/contacto",
      );
    },
  );
});
