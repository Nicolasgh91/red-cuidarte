import type { AuthEvent } from "./machine";
import { deviceLabel } from "./deviceLabel";
import { establishDevice, loginWithPasskey, reauthWithPasskey } from "./deviceFlow";
import type { DeviceApi, Passkeys } from "./deviceFlow";
import type { DeviceStore } from "./deviceStore";
import { deviceErrorMessage, passkeysSupported } from "./passkeys";
import { AuthFlowError } from "./services";

/**
 * Parte "imperativa" del ingreso (sin React): sabe quién es el usuario, evita que dos
 * verificaciones corran a la vez y comparte un único re-ingreso transparente con passkey.
 */
export class DeviceController {
  /** Usuario de Supabase con sesión abierta. */
  private userId: string | null = null;
  private phase: "register" | "login" = "register";
  private checking = false;
  private reloginPromise: Promise<boolean> | null = null;

  constructor(
    private readonly deps: {
      deviceApi: () => DeviceApi;
      passkeys: Passkeys;
      store: DeviceStore;
      supported?: () => boolean;
    },
  ) {}

  setUser(userId: string | null): void {
    this.userId = userId;
  }

  private flowDeps() {
    if (!this.userId) throw new AuthFlowError("No hay una sesión activa.");
    return {
      api: this.deps.deviceApi(),
      passkeys: this.deps.passkeys,
      store: this.deps.store,
      userId: this.userId,
      label: deviceLabel(),
      onPhase: (p: "register" | "login") => {
        this.phase = p;
      },
    };
  }

  /** 403 device_login_required: vuelve a verificar la passkey. true si hay token nuevo. */
  relogin(): Promise<boolean> {
    this.reloginPromise ??= (async () => {
      try {
        await loginWithPasskey(this.flowDeps());
        return true;
      } catch {
        return false;
      } finally {
        this.reloginPromise = null;
      }
    })();
    return this.reloginPromise;
  }

  /**
   * Acción sensible del admin: pide la passkey siempre (no alcanza con el token vigente). Lanza
   * AuthFlowError con el mensaje para mostrar si no se completa.
   */
  async reauth(): Promise<void> {
    try {
      await reauthWithPasskey(this.flowDeps());
    } catch (e) {
      throw e instanceof AuthFlowError ? e : new AuthFlowError(deviceErrorMessage(e));
    }
  }

  /**
   * Registra o verifica la passkey y devuelve el evento resultante para la máquina de
   * estados (null si ya había una verificación en curso). Con `interactive: false` (arranque
   * automático) un rechazo del navegador por falta de gesto no se muestra como error.
   */
  async check(opts: { interactive: boolean }): Promise<AuthEvent | null> {
    if (this.checking) return null;
    this.checking = true;
    try {
      if (!(this.deps.supported ?? passkeysSupported)()) {
        console.warn("[passkey] WebAuthn no disponible en este navegador");
        throw new AuthFlowError("Este navegador no permite usar passkeys. Probá con otro.");
      }
      const outcome = await establishDevice(this.flowDeps());
      return outcome.kind === "ready" ? { type: "device_ok" } : { type: "not_registered" };
    } catch (e) {
      const silent = !opts.interactive && e instanceof Error && e.name === "NotAllowedError";
      return {
        type: "device_prompt",
        phase: this.phase,
        error: silent
          ? null
          : e instanceof AuthFlowError
            ? e.message
            : deviceErrorMessage(e, this.phase),
      };
    } finally {
      this.checking = false;
    }
  }
}
