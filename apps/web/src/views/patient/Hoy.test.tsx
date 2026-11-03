import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DISCLAIMER } from "../../lib/labels";
import { fail, fakeApi, ok, renderWithApp } from "../../test/render";
import { Hoy } from "./Hoy";

const today = {
  patient: { first_name: "Elena", last_name: "Ejemplo" },
  date: "2026-10-21",
  today_shifts: [],
  current: null,
  next: null,
  doses: [],
};

function api(linkCode: { $get: unknown; $post?: unknown }, todayData: unknown = today) {
  return fakeApi({
    patient: { today: { $get: vi.fn(async () => ok(todayData)) }, "link-code": linkCode },
  });
}

describe("Hoy (paciente)", () => {
  it("muestra el código para vincular a su cuidador/a y permite pedir uno nuevo", async () => {
    const get = vi
      .fn()
      .mockResolvedValue(ok({ code: "ABCD2345", expires_at: "2026-10-23T15:00:00Z" }));
    const post = vi
      .fn()
      .mockResolvedValue(ok({ code: "WXYZ6789", expires_at: "2026-10-23T16:00:00Z" }));
    const user = userEvent.setup();
    renderWithApp(<Hoy />, { api: api({ $get: get, $post: post }) });
    expect(await screen.findByText("ABCD-2345")).toBeInTheDocument();
    // avisa que el código anterior deja de servir
    expect(screen.getByText(/el anterior deja de funcionar/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generar un código nuevo" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(await screen.findByText("WXYZ-6789")).toBeInTheDocument();
    expect(await screen.findByText("Código nuevo listo.")).toBeInTheDocument();
  });

  it("muestra hasta cuándo vale el código", async () => {
    const get = vi
      .fn()
      .mockResolvedValue(ok({ code: "ABCD2345", expires_at: "2026-10-23T15:00:00Z" }));
    renderWithApp(<Hoy />, { api: api({ $get: get }) });
    expect(await screen.findByText(/^Vale hasta .*octubre/)).toBeInTheDocument();
  });

  it("si el código no se pudo generar, ofrece Reintentar", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(fail(500, "internal", "No pudimos generar el código."))
      .mockResolvedValue(ok({ code: "ABCD2345", expires_at: "2026-10-23T15:00:00Z" }));
    const user = userEvent.setup();
    renderWithApp(<Hoy />, { api: api({ $get: get }) });
    expect(await screen.findByText("No pudimos generar el código.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("ABCD-2345")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("sin turnos ni medicación explica qué falta y señala el código", async () => {
    const get = vi
      .fn()
      .mockResolvedValue(ok({ code: "ABCD2345", expires_at: "2026-10-23T15:00:00Z" }));
    renderWithApp(<Hoy />, { api: api({ $get: get }) });
    expect(await screen.findByText(/Todavía no hay turnos cargados/)).toHaveTextContent(
      "compartí el código de más abajo",
    );
    expect(screen.getByText("No hay medicación cargada.")).toBeInTheDocument();
  });

  it("no muestra la frase del día pensada para quien cuida; sí ayuda y aviso médico", async () => {
    const get = vi
      .fn()
      .mockResolvedValue(ok({ code: "ABCD2345", expires_at: "2026-10-23T15:00:00Z" }));
    renderWithApp(<Hoy />, { api: api({ $get: get }) });
    await screen.findByText("ABCD-2345");
    expect(screen.queryByText(/Frase del día/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contacto" })).toHaveAttribute("href", "/contacto");
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });
});
