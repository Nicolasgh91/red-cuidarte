import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithApp } from "../test/render";
import { AccountMenu } from "./AccountMenu";

describe("AccountMenu", () => {
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
