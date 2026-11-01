import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type { Passkeys } from "./deviceFlow";

export const webPasskeys: Passkeys = {
  register: (options) =>
    startRegistration({ optionsJSON: options as PublicKeyCredentialCreationOptionsJSON }),
  login: (options) =>
    startAuthentication({ optionsJSON: options as PublicKeyCredentialRequestOptionsJSON }),
};

export const passkeysSupported = (): boolean => browserSupportsWebAuthn();

export const PASSKEY_ELSEWHERE_MSG =
  "No se completó la verificación. Si tu passkey no está en este equipo, elegí usar tu teléfono (código QR) o pedile al administrador que la restablezca.";

/**
 * Mensaje en castellano para un error de WebAuthn o de la API. En el ingreso (`login`), si no se
 * completa, sugiere el QR del teléfono: la passkey puede estar en otro equipo.
 */
export function deviceErrorMessage(e: unknown, phase?: "register" | "login"): string {
  const name = e instanceof Error ? e.name : "";
  const code = (e as { code?: string } | null)?.code ?? "";
  console.error("[passkey]", name, code, e);
  if (name === "NotAllowedError" || code === "ERROR_CEREMONY_ABORTED")
    return phase === "login"
      ? PASSKEY_ELSEWHERE_MSG
      : "No se completó la verificación. Probá de nuevo.";
  if (name === "InvalidStateError" || code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
    return "Este equipo ya tiene una passkey guardada para Cuidarte+. Probá de nuevo.";
  if (name === "NotSupportedError" || name === "SecurityError")
    return "Este navegador no permite usar passkeys. Probá con otro.";
  if (e instanceof Error && e.name === "ApiError") return e.message;
  return "No pudimos verificar tu passkey. Probá de nuevo.";
}
