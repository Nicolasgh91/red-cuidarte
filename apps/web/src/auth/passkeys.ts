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

/** Mensaje en castellano para un error de WebAuthn o de la API. */
export function deviceErrorMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  const code = (e as { code?: string } | null)?.code ?? "";
  if (name === "NotAllowedError" || code === "ERROR_CEREMONY_ABORTED")
    return "No se completó la verificación. Probá de nuevo.";
  if (name === "InvalidStateError" || code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
    return "Este dispositivo ya tiene una llave guardada para Cuidarte+. Probá de nuevo.";
  if (name === "NotSupportedError" || name === "SecurityError")
    return "Este navegador no permite verificar el dispositivo. Probá con otro.";
  if (e instanceof Error && e.name === "ApiError") return e.message;
  return "No pudimos verificar este dispositivo. Probá de nuevo.";
}
