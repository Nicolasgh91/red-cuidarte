import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./common";

describe("Field", () => {
  it("enlaza la pista y el error con el control", () => {
    render(
      <Field id="x" label="Celular" hint="Con código de área." error="Revisá el celular.">
        <input id="x" />
      </Field>,
    );
    const input = screen.getByLabelText("Celular");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Con código de área. Revisá el celular.");
    expect(screen.getByRole("alert")).toHaveAttribute("id", "x-err");
  });

  it("sin error no marca el control como inválido", () => {
    render(
      <Field id="y" label="Nombre" hint="Como figura en el documento.">
        <input id="y" />
      </Field>,
    );
    const input = screen.getByLabelText("Nombre");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("Como figura en el documento.");
  });

  it("sin pista ni error no agrega atributos", () => {
    render(
      <Field id="z" label="Fecha">
        <input id="z" />
      </Field>,
    );
    const input = screen.getByLabelText("Fecha");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("conserva el aria-describedby que ya traía el control", () => {
    render(
      <Field id="w" label="Mail" error="Revisá el mail.">
        <input id="w" aria-describedby="otro" />
      </Field>,
    );
    expect(screen.getByLabelText("Mail")).toHaveAttribute("aria-describedby", "otro w-err");
  });
});
