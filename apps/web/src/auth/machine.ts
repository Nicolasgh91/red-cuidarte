/**
 * Máquina de estados del ingreso:
 *   loading → signed-out → device-check → ready | not-registered
 * El login, el registro y la recuperación de contraseña son pasos locales de cada pantalla: la
 * máquina solo se entera cuando hay sesión (signed_in). Es un reducer puro: la E/S (Supabase, WebAuthn, API) vive en AuthProvider y deviceFlow.
 */
export type DevicePhase = "checking" | "register" | "login";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out"; error: string | null }
  | { status: "device-check"; phase: DevicePhase; error: string | null }
  | { status: "not-registered" }
  | { status: "ready" };

export type AuthEvent =
  /** Al abrir la app: hay sesión de Supabase (y, si este equipo ya verificó la passkey, se entra). */
  | { type: "session_restored"; verified: boolean }
  | { type: "no_session" }
  /** Se abrió la sesión de Supabase (contraseña, registro o código de recuperación). */
  | { type: "signed_in" }
  /** Hay que verificar la passkey (automático, sin pedir nada todavía). */
  | { type: "device_checking" }
  /** Hace falta un gesto del usuario (registrar o verificar la passkey). */
  | { type: "device_prompt"; phase: "register" | "login"; error: string | null }
  | { type: "device_ok" }
  | { type: "not_registered" }
  | { type: "signed_out"; error?: string | null };

export const initialAuthState: AuthState = { status: "loading" };

export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case "session_restored":
      return state.status === "loading"
        ? event.verified
          ? { status: "ready" }
          : { status: "device-check", phase: "checking", error: null }
        : state;
    case "no_session":
      return state.status === "loading" ? { status: "signed-out", error: null } : state;
    case "signed_in":
      return state.status === "signed-out"
        ? { status: "device-check", phase: "checking", error: null }
        : state;
    case "device_checking":
      return state.status === "device-check" || state.status === "ready"
        ? { status: "device-check", phase: "checking", error: null }
        : state;
    case "device_prompt":
      return state.status === "device-check" || state.status === "ready"
        ? { status: "device-check", phase: event.phase, error: event.error }
        : state;
    case "device_ok":
      return state.status === "device-check" ? { status: "ready" } : state;
    case "not_registered":
      return state.status === "device-check" || state.status === "ready"
        ? { status: "not-registered" }
        : state;
    case "signed_out":
      return { status: "signed-out", error: event.error ?? null };
  }
}
