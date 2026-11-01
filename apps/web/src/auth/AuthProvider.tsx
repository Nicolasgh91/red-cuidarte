import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { API_URL, createApiClient } from "../api/client";
import type { AuthIssue } from "../api/client";
import { ApiError, errorMessage, unwrap } from "../api/errors";
import { call } from "../api/rpc";
import type { ApiClient } from "../api/types";
import { deviceStore } from "./deviceStore";
import {
  deviceErrorMessage,
  loginWithPasskey,
  passkeysSupported,
  registerPasskey,
} from "./passkeys";
import * as supabase from "./services";
import { AuthFlowError } from "./services";

/**
 * Estado del ingreso: loading → signed-out → passkey → ready | not-registered.
 * En `passkey`, `phase` dice qué gesto falta (o `checking` mientras se verifica solo).
 */
export type AuthState =
  | { status: "loading" }
  | { status: "signed-out"; error: string | null }
  | { status: "passkey"; phase: "checking" | "register" | "login"; error: string | null }
  | { status: "not-registered" }
  | { status: "ready" };

interface AuthContextValue {
  state: AuthState;
  api: ApiClient;
  /**
   * Las acciones de ingreso abren la sesión y pasan a verificar la passkey. Si fallan lanzan
   * AuthFlowError con el mensaje para mostrar en la pantalla.
   */
  signIn(email: string, password: string): Promise<void>;
  /** Autorregistro de cuidador/a o paciente: crea la cuenta en la API y después inicia sesión. */
  signUp(data: SignupData): Promise<void>;
  sendRecoveryCode(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<void>;
  /** Registra o verifica la passkey de la cuenta (llamar dentro del click: WebAuthn pide un gesto). */
  checkDevice(): Promise<void>;
  signOut(): Promise<void>;
}

/** Datos del autorregistro según el rol elegido; el de administrador no se puede pedir. */
export type SignupData =
  | {
      role: "caregiver";
      first_name: string;
      last_names: string;
      phone: string;
      email: string;
      birth_date: string;
      password: string;
    }
  | {
      role: "patient";
      first_name: string;
      last_name: string;
      email: string;
      password: string;
    };

export type SignupRole = SignupData["role"];

/** Cualquier falla del ingreso sale como AuthFlowError, con un mensaje listo para mostrar. */
async function flow<T>(p: Promise<T>, fallback: string): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AuthFlowError) throw e;
    throw new AuthFlowError(e instanceof ApiError ? errorMessage(e) : fallback);
  }
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
export const useApi = (): ApiClient => useAuth().api;

/** Tope para esperar a que la API borre la cookie al cerrar sesión. */
const LOGOUT_TIMEOUT_MS = 5_000;

/**
 * La sesión de este cliente: quién está adentro y la passkey. Vive mientras viva el provider (sin
 * estado de módulo) y solo cambia la UI a través de `setState`.
 */
function createSession(
  setState: (s: AuthState) => void,
  queryClient: QueryClient,
  apiOverride?: ApiClient,
) {
  let userId: string | null = null;
  let checking = false;
  /** Re-ingreso con passkey en curso: los 403 simultáneos comparten uno solo. */
  let relogin: Promise<boolean> | null = null;
  /** Falló el re-ingreso automático: hasta que la persona toque el botón, no se reintenta solo. */
  let needsGesture = false;
  let ending: Promise<void> | null = null;

  /**
   * Si la cuenta no tiene passkey la registra; si tiene, la verifica; si el token sigue vigente no
   * pide nada. Sin gesto (`interactive: false`), el rechazo del navegador no se muestra como error.
   */
  async function ensurePasskey(interactive: boolean): Promise<void> {
    const uid = userId;
    if (!uid || checking) return;
    checking = true;
    let phase: "register" | "login" = "register";
    setState({ status: "passkey", phase: "checking", error: null });
    try {
      if (!passkeysSupported()) {
        throw new AuthFlowError("Este navegador no permite usar passkeys. Probá con otro.");
      }
      const status = await unwrap(api.device.status.$get());
      if (status.verified) deviceStore.setVerified(uid);
      else if (status.registered) {
        phase = "login";
        await loginWithPasskey(api, uid);
      } else await registerPasskey(api, uid);
      if (userId !== uid) return; // cerró sesión mientras tanto
      needsGesture = false;
      setState({ status: "ready" });
    } catch (e) {
      if (userId !== uid) return;
      if (e instanceof ApiError && e.code === "not_registered") {
        return setState({ status: "not-registered" });
      }
      const silent = !interactive && e instanceof Error && e.name === "NotAllowedError";
      setState({
        status: "passkey",
        phase,
        error: silent
          ? null
          : e instanceof AuthFlowError
            ? e.message
            : deviceErrorMessage(e, phase),
      });
    } finally {
      checking = false;
    }
  }

  /** 403 device_login_required: un intento automático compartido. true si hay token nuevo. */
  function reloginOnce(): Promise<boolean> {
    const uid = userId;
    if (!uid || needsGesture) return Promise.resolve(false);
    relogin ??= loginWithPasskey(api, uid)
      .then(
        () => true,
        () => {
          needsGesture = true;
          return false;
        },
      )
      .finally(() => {
        relogin = null;
      });
    return relogin;
  }

  function onAuthIssue(issue: AuthIssue): void {
    if (issue.code === "unauthorized") {
      void end("Tu sesión venció. Ingresá de nuevo.", { supabase: true });
      return;
    }
    if (!userId) return;
    if (issue.code === "not_registered") setState({ status: "not-registered" });
    else if (issue.code === "device_unregistered") void ensurePasskey(false);
    else setState({ status: "passkey", phase: "login", error: null });
  }

  const api =
    apiOverride ??
    createApiClient(API_URL, {
      getAccessToken: () => supabase.getAccessToken(),
      getDeviceToken: () => deviceStore.getToken(),
      relogin: reloginOnce,
      onAuthIssue,
    });

  /**
   * Cierra la sesión. Espera a que la API borre la cookie del token (con tope) antes de limpiar lo
   * local, para que una navegación no corte el borrado. Con `supabase: true` cierra también la
   * sesión de Supabase. Llamadas simultáneas comparten el cierre.
   */
  function end(error: string | null, opts: { supabase?: boolean } = {}): Promise<void> {
    ending ??= (async () => {
      await Promise.allSettled([
        (async () => opts.supabase && (await supabase.signOut()))(),
        api.logout.$post(undefined, { init: { signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS) } }),
      ]);
      deviceStore.clear();
      queryClient.clear();
      userId = null;
      needsGesture = false;
      relogin = null;
      setState({ status: "signed-out", error });
    })().finally(() => {
      ending = null;
    });
    return ending;
  }

  /** Hay sesión de Supabase: se entra directo si este equipo ya verificó la passkey. */
  function opened(uid: string, restored = false): void {
    userId = uid;
    if (restored && deviceStore.isVerified(uid)) setState({ status: "ready" });
    else void ensurePasskey(false);
  }

  return { api, ensurePasskey, end, opened };
}

interface Props {
  children: ReactNode;
  /** Para tests: reemplaza el cliente real de la API. */
  apiOverride?: ApiClient;
}

export function AuthProvider({ children, apiOverride }: Props) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [session] = useState(() => createSession(setState, queryClient, apiOverride));

  // Sesión al abrir la app.
  useEffect(() => {
    let cancelled = false;
    supabase
      .getSession()
      .then((s) => {
        if (cancelled) return;
        if (s) session.opened(s.userId, true);
        else setState({ status: "signed-out", error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "signed-out", error: null });
      });
    let off: () => void = () => undefined;
    try {
      off = supabase.onSignedOut(() => void session.end(null));
    } catch {
      /* sin configuración de Supabase: el error se muestra al intentar ingresar */
    }
    return () => {
      cancelled = true;
      off();
    };
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      api: session.api,
      async signIn(email, password) {
        const { userId } = await flow(
          supabase.signIn(email, password),
          "No pudimos iniciar sesión. Probá de nuevo.",
        );
        session.opened(userId);
      },
      async signUp(data) {
        await flow(
          unwrap(call(session.api.signup.$post, { json: data })),
          "No pudimos crear la cuenta. Probá de nuevo.",
        );
        const { userId } = await flow(
          supabase.signIn(data.email, data.password),
          "Tu cuenta quedó creada, pero no pudimos abrirla. Ingresá con tu mail y contraseña.",
        );
        session.opened(userId);
      },
      sendRecoveryCode: (email) =>
        flow(supabase.sendRecoveryCode(email), "No pudimos mandar el código. Probá de nuevo."),
      async resetPassword(email, code, password) {
        const { userId } = await flow(
          supabase.resetPassword(email, code, password),
          "No pudimos guardar la contraseña. Probá de nuevo.",
        );
        session.opened(userId);
      },
      checkDevice: () => session.ensurePasskey(true),
      // Si Supabase falla, igual se cierra la sesión local.
      signOut: () => session.end(null, { supabase: true }),
    }),
    [state, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
