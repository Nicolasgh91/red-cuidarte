const TOKEN_KEY = "cuidarte.deviceToken";
const CREDENTIAL_KEY = "cuidarte.credential";
const CREDENTIAL_USER_KEY = "cuidarte.credentialUser";

export interface DeviceStore {
  getToken(): string | null;
  setToken(token: string): void;
  clearToken(): void;
  /** Id de la credencial guardada en este dispositivo para ese usuario (null si es de otro usuario). */
  getCredential(userId: string): string | null;
  setCredential(userId: string, credentialId: string): void;
  clearCredential(): void;
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
  clearToken: () => safe(() => localStorage.removeItem(TOKEN_KEY), undefined),
  getCredential: (userId) =>
    safe(
      () =>
        localStorage.getItem(CREDENTIAL_USER_KEY) === userId
          ? localStorage.getItem(CREDENTIAL_KEY)
          : null,
      null,
    ),
  setCredential: (userId, id) =>
    safe(() => {
      localStorage.setItem(CREDENTIAL_KEY, id);
      localStorage.setItem(CREDENTIAL_USER_KEY, userId);
    }, undefined),
  clearCredential: () =>
    safe(() => {
      localStorage.removeItem(CREDENTIAL_KEY);
      localStorage.removeItem(CREDENTIAL_USER_KEY);
    }, undefined),
};
