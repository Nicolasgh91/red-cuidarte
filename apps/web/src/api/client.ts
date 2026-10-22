import { hc } from "hono/client";
import type { AppType } from "api";
import type { ApiClient } from "./types";

/**
 * URL de la API. Puede ser relativa ("/api"): la web la sirve por un rewrite de Vercel en su mismo
 * dominio, así el navegador no hace CORS ni preflight. Se completa con el origen de la página.
 */
export const resolveApiUrl = (url: string, origin = globalThis.location?.origin ?? ""): string =>
  url.startsWith("/") ? `${origin}${url}` : url;

export const API_URL: string = resolveApiUrl(
  import.meta.env.VITE_API_URL ?? "http://localhost:8787",
);

export interface AuthIssue {
  code:
    | "device_unregistered"
    | "device_login_required"
    | "device_blocked"
    | "not_registered"
    | "unauthorized";
  message: string;
}

export interface ApiHooks {
  getAccessToken(): Promise<string | null>;
  getDeviceToken(): string | null;
  /** 403 device_login_required: repite el ingreso con passkey. true si se obtuvo un token nuevo. */
  relogin(): Promise<boolean>;
  onAuthIssue(issue: AuthIssue): void;
}

/** Ningún pedido queda colgado: pasado este tiempo falla y la consulta muestra «Reintentar». */
export const REQUEST_TIMEOUT_MS = 20_000;

const AUTH_CODES = new Set<string>(["device_unregistered", "device_blocked", "not_registered"]);

async function errorBody(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: string; message?: string } };
    return body.error ?? {};
  } catch {
    return {};
  }
}

/**
 * Cliente Hono RPC. Cada pedido lleva `Authorization: Bearer <JWT de Supabase>` y
 * `X-Device-Token`. Los 403 de dispositivo/cuenta se resuelven acá (re-ingreso transparente
 * o cambio de estado de la sesión); el resto de los errores los ve quien llama (`unwrap`).
 */
export function createApiClient(
  baseUrl: string,
  hooks: ApiHooks,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): ApiClient {
  const devicePrefix = `${baseUrl.replace(/\/$/, "")}/device/`;

  const send = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const jwt = await hooks.getAccessToken();
    if (jwt) headers.set("Authorization", `Bearer ${jwt}`);
    const dt = hooks.getDeviceToken();
    if (dt) headers.set("X-Device-Token", dt);
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetchImpl(input, { ...init, headers, signal });
  };

  const apiFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let res = await send(input, init);
    // Las rutas /device/* emiten el token: sus errores los maneja el flujo de dispositivo.
    if (String(input instanceof Request ? input.url : input).startsWith(devicePrefix)) return res;

    if (res.status === 401) {
      const b = await errorBody(res);
      hooks.onAuthIssue({
        code: "unauthorized",
        message: b.message ?? "Tenés que iniciar sesión.",
      });
      return res;
    }
    if (res.status === 403) {
      const b = await errorBody(res);
      if (b.code === "device_login_required" && (await hooks.relogin())) {
        res = await send(input, init);
        return res;
      }
      if (b.code && AUTH_CODES.has(b.code)) {
        hooks.onAuthIssue({ code: b.code as AuthIssue["code"], message: b.message ?? "" });
      } else if (b.code === "device_login_required") {
        hooks.onAuthIssue({ code: "device_login_required", message: b.message ?? "" });
      }
    }
    return res;
  }) as typeof fetch;

  return hc<AppType>(baseUrl, { fetch: apiFetch });
}
