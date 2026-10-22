/**
 * Máquina de estados del ingreso:
 *   loading → signed-out → otp → device-check → ready | blocked | not-registered
 * Es un reducer puro: la E/S (Supabase, WebAuthn, API) vive en AuthProvider y deviceFlow.
 */
export type DevicePhase = "checking" | "register" | "login";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out"; error: string | null }
  | { status: "otp"; email: string; error: string | null }
  | { status: "device-check"; phase: DevicePhase; error: string | null }
  | { status: "blocked"; message: string }
  | { status: "not-registered" }
  | { status: "ready" };

export type AuthEvent =
  /** Al abrir la app: hay sesión de Supabase (y, si hay token de dispositivo, se intenta usar). */
  | { type: "session_restored"; hasDeviceToken: boolean }
  | { type: "no_session" }
  | { type: "code_sent"; email: string }
  | { type: "code_failed"; error: string }
  | { type: "use_other_email" }
  | { type: "otp_verified" }
  /** Hay que verificar el dispositivo (automático, sin pedir nada todavía). */
  | { type: "device_checking" }
  /** Hace falta un gesto del usuario (registrar o verificar la passkey). */
  | { type: "device_prompt"; phase: "register" | "login"; error: string | null }
  | { type: "device_ok" }
  | { type: "device_blocked"; message: string }
  | { type: "not_registered" }
  | { type: "signed_out"; error?: string | null };

export const initialAuthState: AuthState = { status: "loading" };

export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case "session_restored":
      return state.status === "loading"
        ? event.hasDeviceToken
          ? { status: "ready" }
          : { status: "device-check", phase: "checking", error: null }
        : state;
    case "no_session":
      return state.status === "loading" ? { status: "signed-out", error: null } : state;
    case "code_sent":
      return state.status === "signed-out" || state.status === "otp"
        ? { status: "otp", email: event.email, error: null }
        : state;
    case "code_failed":
      return state.status === "signed-out"
        ? { status: "signed-out", error: event.error }
        : state.status === "otp"
          ? { ...state, error: event.error }
          : state;
    case "use_other_email":
      return state.status === "otp" ? { status: "signed-out", error: null } : state;
    case "otp_verified":
      return state.status === "otp"
        ? { status: "device-check", phase: "checking", error: null }
        : state;
    case "device_checking":
      return state.status === "device-check" ||
        state.status === "ready" ||
        state.status === "blocked"
        ? { status: "device-check", phase: "checking", error: null }
        : state;
    case "device_prompt":
      return state.status === "device-check" || state.status === "ready"
        ? { status: "device-check", phase: event.phase, error: event.error }
        : state;
    case "device_ok":
      return state.status === "device-check" ? { status: "ready" } : state;
    case "device_blocked":
      return state.status === "device-check" || state.status === "ready"
        ? { status: "blocked", message: event.message }
        : state;
    case "not_registered":
      return state.status === "device-check" || state.status === "ready"
        ? { status: "not-registered" }
        : state;
    case "signed_out":
      return { status: "signed-out", error: event.error ?? null };
  }
}
