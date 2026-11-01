const TOKEN_KEY = "cuidarte.deviceToken";
const VERIFIED_KEY = "cuidarte.verifiedUser";
/** De la versión que guardaba el token y la credencial en la web. */
const LEGACY_KEYS = ["cuidarte.credential", "cuidarte.credentialUser"];

export interface DeviceStore {
  /**
   * Token de dispositivo para X-Device-Token. Solo lo tiene la app nativa: en la web vive en una
   * cookie HttpOnly que ningún script puede leer.
   */
  getToken(): string | null;
  setToken(token: string): void;
  /**
   * Pista (no es una credencial): este dispositivo ya verificó la passkey de ese usuario, así al
   * abrir la app se entra directo. La API decide igual en cada pedido.
   */
  isVerified(userId: string): boolean;
  setVerified(userId: string): void;
  /** Borra el token y la pista (al cerrar sesión). */
  clear(): void;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Persistencia en localStorage (puede fallar en modo privado: se tolera). */
export const localDeviceStore: DeviceStore = {
  getToken: () => safe(() => localStorage.getItem(TOKEN_KEY), null),
  setToken: (t) => safe(() => localStorage.setItem(TOKEN_KEY, t), undefined),
  isVerified: (userId) => safe(() => localStorage.getItem(VERIFIED_KEY) === userId, false),
  setVerified: (userId) => safe(() => localStorage.setItem(VERIFIED_KEY, userId), undefined),
  clear: () =>
    safe(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(VERIFIED_KEY);
    }, undefined),
};

/**
 * La web ya no guarda el token ni la credencial: borra lo que dejó la versión anterior. El token
 * viejo igual dejó de servir (la API solo lo acepta por header desde la app nativa).
 */
export function purgeLegacyDeviceKeys(native: boolean): void {
  safe(() => {
    for (const k of native ? LEGACY_KEYS : [TOKEN_KEY, ...LEGACY_KEYS]) localStorage.removeItem(k);
  }, undefined);
}
