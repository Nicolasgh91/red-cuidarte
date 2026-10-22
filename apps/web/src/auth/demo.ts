import type { Role } from "../api/types";
import type { AuthServices } from "./services";

/**
 * Modo demo (VITE_DEMO_MODE=true, y DEMO_MODE=true en la API): el ingreso lista los usuarios de
 * la base y se entra como cualquiera, sin mail ni passkey. Solo para presentaciones.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const KEY = "cuidarte.demoUser";

/** Orden en que se agrupan los usuarios en el selector y en la barra demo. */
export const DEMO_ROLES: readonly Role[] = ["admin", "caregiver", "patient"];

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

/**
 * Cambia de usuario y recarga desde el inicio: así no queda nada del anterior (consultas en caché,
 * ruta de otro rol, recordatorios del cuidador) y se abre el inicio del rol nuevo.
 */
export function switchDemoUser(
  id: string,
  reload: (url: string) => void = (u) => location.assign(u),
) {
  setDemoUser(id);
  reload("/");
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
