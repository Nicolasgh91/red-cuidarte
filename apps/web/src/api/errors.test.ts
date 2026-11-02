import { describe, expect, it } from "vitest";
import { ApiError, GENERIC_MESSAGE, NETWORK_MESSAGE, statusMessage, unwrap } from "./errors";

const res = (status: number, body?: unknown) => ({
  ok: status < 400,
  status,
  json: async () => {
    if (body === undefined) throw new SyntaxError("no es JSON");
    return body;
  },
});

describe("unwrap", () => {
  it("usa el mensaje del servidor cuando lo trae", async () => {
    const e = await unwrap(
      Promise.resolve(res(502, { error: { code: "mail_failed", message: "No se pudo." } })),
    ).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 502, code: "mail_failed", message: "No se pudo." });
  });

  it("sin cuerpo JSON (504 del gateway) explica según el status, no «Algo salió mal»", async () => {
    const e = (await unwrap(Promise.resolve(res(504))).catch((x: unknown) => x)) as ApiError;
    expect(e.message).toBe("La respuesta tardó demasiado. Probá de nuevo.");
    expect(e.message).not.toBe(GENERIC_MESSAGE);
  });

  it("un corte de red es «network»", async () => {
    const e = (await unwrap(Promise.reject(new TypeError("fetch failed"))).catch(
      (x: unknown) => x,
    )) as ApiError;
    expect(e).toMatchObject({ status: 0, code: "network", message: NETWORK_MESSAGE });
  });
});

describe("statusMessage", () => {
  it.each([
    [401, "sesión"],
    [403, "permiso"],
    [413, "grande"],
    [429, "intentos"],
    [503, "de nuestro lado"],
  ])("%i", (status, part) => expect(statusMessage(status)).toContain(part));
  it("otros códigos: mensaje genérico", () => expect(statusMessage(418)).toBe(GENERIC_MESSAGE));
});
