import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, ok, renderWithApp } from "../../test/render";
import { Hoy } from "./Hoy";

const today = {
  patient: { first_name: "Elena", last_name: "Ejemplo" },
  date: "2026-10-21",
  today_shifts: [],
  current: null,
  next: null,
  doses: [],
};

describe("Hoy (persona cuidada)", () => {
  it("muestra el código para vincular a su cuidador/a y permite pedir uno nuevo", async () => {
    const get = vi
      .fn()
      .mockResolvedValue(ok({ code: "ABCD2345", expires_at: "2026-10-23T15:00:00Z" }));
    const post = vi
      .fn()
      .mockResolvedValue(ok({ code: "WXYZ6789", expires_at: "2026-10-23T16:00:00Z" }));
    const api = fakeApi({
      patient: {
        today: { $get: vi.fn(async () => ok(today)) },
        "link-code": { $get: get, $post: post },
      },
    });
    const user = userEvent.setup();
    renderWithApp(<Hoy />, { api });
    expect(await screen.findByText("ABCD-2345")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generar un código nuevo" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(await screen.findByText("WXYZ-6789")).toBeInTheDocument();
  });
});
