import { WebAuthnError } from "@simplewebauthn/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors";
import { PASSKEY_ELSEWHERE_MSG, deviceErrorMessage } from "./passkeys";

/** Error como lo arma @simplewebauthn/browser: conserva el nombre del DOMException original. */
const webauthn = (name: string, code: ConstructorParameters<typeof WebAuthnError>[0]["code"]) =>
  new WebAuthnError({ message: name, code, cause: new DOMException(name, name) });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deviceErrorMessage", () => {
  it("cancelado o vencido: reintentar; en el ingreso sugiere el QR", () => {
    const e = webauthn("NotAllowedError", "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY");
    expect(deviceErrorMessage(e, "register")).toBe(
      "No se completó la verificación. Probá de nuevo.",
    );
    expect(deviceErrorMessage(e, "login")).toBe(PASSKEY_ELSEWHERE_MSG);
  });

  it("sin bloqueo de pantalla: pide activarlo", () => {
    expect(
      deviceErrorMessage(
        webauthn("ConstraintError", "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT"),
      ),
    ).toMatch(/bloqueo de pantalla/);
  });

  it("dominio no habilitado: indica la dirección correcta", () => {
    expect(deviceErrorMessage(webauthn("SecurityError", "ERROR_INVALID_DOMAIN"))).toMatch(
      /https:\/\/redasistir\.online/,
    );
  });

  it("navegador sin soporte", () => {
    expect(
      deviceErrorMessage(
        webauthn("NotSupportedError", "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG"),
      ),
    ).toBe("Este navegador no permite usar passkeys. Probá con otro.");
  });

  it("error de la API: muestra el motivo que manda el servidor", () => {
    const e = new ApiError(400, "webauthn_origin", "Esta dirección no está habilitada.");
    expect(deviceErrorMessage(e, "register")).toBe("Esta dirección no está habilitada.");
  });

  it("cualquier otro error: mensaje genérico", () => {
    expect(deviceErrorMessage(new Error("boom"))).toBe(
      "No pudimos verificar tu passkey. Probá de nuevo.",
    );
  });
});
