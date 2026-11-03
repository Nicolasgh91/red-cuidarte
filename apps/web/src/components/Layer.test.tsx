import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithApp } from "../test/render";
import { UrgentButton } from "./Layer";

describe("UrgentDialog", () => {
  it("al abrirse lleva el foco adentro y al cerrarse lo devuelve al botón", async () => {
    const user = userEvent.setup();
    renderWithApp(<UrgentButton />, { api: fakeApi({ me: vi.fn() }) });
    const opener = screen.getByRole("button", { name: /Urgencia/ });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Urgencia" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("link", { name: "Llamar al 107" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(opener).toHaveFocus());
  });
});
