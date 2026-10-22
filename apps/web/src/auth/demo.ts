import type { AuthServices } from "./services";

/**
 * Modo demo (VITE_DEMO_MODE=true, y DEMO_MODE=true en la API): el ingreso lista los usuarios de
 * la base y se entra como cualquiera, sin mail ni passkey. Solo para presentaciones.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const KEY = "cuidarte.demoUser";

function readUser(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let current: string | null = readUser();

export function setDemoUser(id: string | null): void {
  current = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: la elección dura hasta recargar */
  }
}

/** La "sesión" es el usuario elegido; la API lo recibe como "Bearer demo:<id>". */
export const demoServices: AuthServices = {
  getSession: async () => (current ? { userId: current } : null),
  onSignedOut: () => () => undefined,
  sendCode: async () => undefined,
  verifyCode: async () => ({ userId: current ?? "" }),
  signOut: async () => setDemoUser(null),
  getAccessToken: async () => (current ? `demo:${current}` : null),
};
