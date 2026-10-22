import { ApiError } from "../api/errors";
import type { DeviceStore } from "./deviceStore";

/** Rutas /device/* de la API (solo con el JWT de Supabase). */
export interface DeviceApi {
  status(): Promise<{ registered: boolean }>;
  registerOptions(label: string): Promise<unknown>;
  registerVerify(response: unknown, label: string): Promise<{ device_token: string }>;
  loginOptions(): Promise<unknown>;
  loginVerify(response: unknown): Promise<{ device_token: string }>;
}

/** Passkeys del navegador (@simplewebauthn/browser). Devuelven la respuesta JSON con su `id`. */
export interface Passkeys {
  register(options: unknown): Promise<{ id: string }>;
  login(options: unknown): Promise<{ id: string }>;
}

export type DeviceOutcome =
  { kind: "ready" } | { kind: "blocked"; message: string } | { kind: "not_registered" };

export interface DeviceDeps {
  api: DeviceApi;
  passkeys: Passkeys;
  store: DeviceStore;
  userId: string;
  label: string;
  /** Avisa qué gesto se va a pedir (para elegir el texto si falla). */
  onPhase?: (phase: "register" | "login") => void;
}

async function register(d: DeviceDeps): Promise<void> {
  d.onPhase?.("register");
  const options = await d.api.registerOptions(d.label);
  const response = await d.passkeys.register(options);
  const { device_token } = await d.api.registerVerify(response, d.label);
  d.store.setCredential(d.userId, response.id);
  d.store.setToken(device_token);
}

/** Verifica la passkey guardada y guarda el token de dispositivo nuevo. */
export async function loginWithPasskey(d: DeviceDeps): Promise<void> {
  d.onPhase?.("login");
  const options = await d.api.loginOptions();
  const response = await d.passkeys.login(options);
  const { device_token } = await d.api.loginVerify(response);
  d.store.setToken(device_token);
}

/**
 * Después del ingreso con código: si este dispositivo ya tiene una credencial guardada se
 * verifica (login); si no, se registra. Si la cuenta ya tiene otro dispositivo, el servidor
 * contesta 403 device_blocked y queda registrado como intento para que el admin autorice.
 */
export async function establishDevice(d: DeviceDeps): Promise<DeviceOutcome> {
  try {
    const status = await d.api.status();
    const credential = d.store.getCredential(d.userId);
    if (status.registered && credential) {
      try {
        await loginWithPasskey(d);
      } catch (e) {
        // El admin liberó la cuenta: la credencial local ya no sirve, se registra de nuevo.
        if (!(e instanceof ApiError && e.code === "device_unregistered")) throw e;
        d.store.clearCredential();
        await register(d);
      }
    } else {
      if (credential && !status.registered) d.store.clearCredential();
      await register(d);
    }
    return { kind: "ready" };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === "device_blocked") return { kind: "blocked", message: e.message };
      if (e.code === "not_registered") return { kind: "not_registered" };
    }
    throw e;
  }
}
