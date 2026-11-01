import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { unwrap } from "../api/errors";
import { call } from "../api/rpc";
import type { ApiClient } from "../api/types";
import { deviceLabel } from "./deviceLabel";
import { deviceStore } from "./deviceStore";

export const passkeysSupported = (): boolean => browserSupportsWebAuthn();

/**
 * La API deja el token en una cookie HttpOnly; en el cuerpo viene solo para la app nativa, que lo
 * manda en X-Device-Token. La pista de "ya verificado" es solo para entrar sin esperar.
 */
function verified(userId: string, { device_token }: { device_token?: string }) {
  if (device_token) deviceStore.setToken(device_token);
  deviceStore.setVerified(userId);
}

/** Primer ingreso: crea la passkey de la cuenta. */
export async function registerPasskey(api: ApiClient, userId: string): Promise<void> {
  const label = deviceLabel();
  const options = await unwrap(call(api.device.register.options.$post, { json: { label } }));
  const response = await startRegistration({
    optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
  });
  verified(
    userId,
    await unwrap(
      call(api.device.register.verify.$post, { json: { response: response as never, label } }),
    ),
  );
}

/** Verifica la passkey de la cuenta (puede estar en otro equipo: QR) y renueva el token. */
export async function loginWithPasskey(api: ApiClient, userId: string): Promise<void> {
  const options = await unwrap(api.device.login.options.$post());
  const response = await startAuthentication({
    optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
  });
  verified(
    userId,
    await unwrap(call(api.device.login.verify.$post, { json: { response: response as never } })),
  );
}

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
