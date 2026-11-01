const TOKEN_KEY = "cuidarte.deviceToken";
const VERIFIED_KEY = "cuidarte.verifiedUser";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Persistencia en localStorage (puede fallar en modo privado: se tolera). */
export const deviceStore = {
  /**
   * Token de dispositivo para X-Device-Token. Solo lo tiene la app nativa: en la web vive en una
   * cookie HttpOnly que ningún script puede leer.
   */
  getToken: (): string | null => safe(() => localStorage.getItem(TOKEN_KEY), null),
  setToken: (t: string) => safe(() => localStorage.setItem(TOKEN_KEY, t), undefined),
  /**
   * Pista, no credencial: este dispositivo ya verificó la passkey de ese usuario, así al abrir la
   * app se entra sin pantalla de carga. La API decide igual el acceso en cada pedido.
   */
  isVerified: (userId: string): boolean =>
    safe(() => localStorage.getItem(VERIFIED_KEY) === userId, false),
  setVerified: (userId: string) =>
    safe(() => localStorage.setItem(VERIFIED_KEY, userId), undefined),
  /** Borra el token y la pista (al cerrar sesión). */
  clear: () =>
    safe(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(VERIFIED_KEY);
    }, undefined),
};
