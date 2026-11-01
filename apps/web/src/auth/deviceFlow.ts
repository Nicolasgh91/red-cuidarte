import { ApiError } from "../api/errors";
import type { DeviceStore } from "./deviceStore";

/**
 * Rutas /device/* de la API (solo con el JWT de Supabase). El token llega en una cookie; en el
 * cuerpo viene solo para la app nativa.
 */
export interface DeviceApi {
  status(): Promise<{ registered: boolean; verified: boolean }>;
  registerOptions(label: string): Promise<unknown>;
  registerVerify(response: unknown, label: string): Promise<{ device_token?: string }>;
  loginOptions(): Promise<unknown>;
  loginVerify(response: unknown): Promise<{ device_token?: string }>;
  reauthOptions(): Promise<unknown>;
  reauthVerify(response: unknown): Promise<unknown>;
}

/** Passkeys del navegador (@simplewebauthn/browser). Devuelven la respuesta JSON con su `id`. */
export interface Passkeys {
  register(options: unknown): Promise<{ id: string }>;
  login(options: unknown): Promise<{ id: string }>;
}

export type DeviceOutcome = { kind: "ready" } | { kind: "not_registered" };

export interface DeviceDeps {
  api: DeviceApi;
  passkeys: Passkeys;
  store: DeviceStore;
  userId: string;
  label: string;
  /** Avisa qué gesto se va a pedir (para elegir el texto si falla). */
  onPhase?: (phase: "register" | "login") => void;
}

function verified(d: DeviceDeps, { device_token }: { device_token?: string }) {
  if (device_token) d.store.setToken(device_token);
  d.store.setVerified(d.userId);
}

async function register(d: DeviceDeps): Promise<void> {
  d.onPhase?.("register");
  const options = await d.api.registerOptions(d.label);
  const response = await d.passkeys.register(options);
  verified(d, await d.api.registerVerify(response, d.label));
}

/** Verifica la passkey de la cuenta (puede estar en otro equipo: QR) y renueva el token. */
export async function loginWithPasskey(d: DeviceDeps): Promise<void> {
  d.onPhase?.("login");
  const options = await d.api.loginOptions();
  const response = await d.passkeys.login(options);
  verified(d, await d.api.loginVerify(response));
}

/**
 * Reautenticación para una acción sensible del admin: siempre pide la passkey, aunque el token
 * siga vigente. La API deja una prueba de un solo uso para la acción que sigue.
 */
export async function reauthWithPasskey(d: DeviceDeps): Promise<void> {
  const options = await d.api.reauthOptions();
  const response = await d.passkeys.login(options);
  await d.api.reauthVerify(response);
}

/**
 * Después de iniciar sesión: si el token sigue vigente no pide nada; si la cuenta ya tiene
 * passkey la verifica (sirve la sincronizada o la del teléfono por QR); si no, la registra.
 */
export async function establishDevice(d: DeviceDeps): Promise<DeviceOutcome> {
  try {
    const status = await d.api.status();
    if (status.verified) d.store.setVerified(d.userId);
    else if (status.registered) await loginWithPasskey(d);
    else await register(d);
    return { kind: "ready" };
  } catch (e) {
    if (e instanceof ApiError && e.code === "not_registered") return { kind: "not_registered" };
    throw e;
  }
}
