import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { API_URL, createApiClient } from "../api/client";
import type { AuthIssue } from "../api/client";
import { ApiError, errorMessage, unwrap } from "../api/errors";
import { call } from "../api/rpc";
import type { ApiClient } from "../api/types";
import { authReducer, initialAuthState } from "./machine";
import type { AuthState } from "./machine";
import { DeviceController } from "./controller";
import type { DeviceApi, Passkeys } from "./deviceFlow";
import { localDeviceStore } from "./deviceStore";
import type { DeviceStore } from "./deviceStore";
import { webPasskeys } from "./passkeys";
import { AuthFlowError, supabaseServices } from "./services";
import type { AuthServices } from "./services";

interface AuthContextValue {
  state: AuthState;
  api: ApiClient;
  /**
   * Las acciones de ingreso abren la sesión y pasan a verificar el dispositivo. Si fallan lanzan
   * AuthFlowError con el mensaje para mostrar en la pantalla.
   */
  signIn(email: string, password: string): Promise<void>;
  /** Autorregistro de cuidador/a o paciente: crea la cuenta en la API y después inicia sesión. */
  signUp(data: SignupData): Promise<void>;
  sendRecoveryCode(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<void>;
  /** Registra o verifica la passkey de la cuenta (gesto del usuario). */
  checkDevice(): Promise<void>;
  /**
   * Antes de una acción sensible del admin: pide la passkey siempre (llamar dentro del click).
   * Lanza AuthFlowError si no se completa.
   */
  confirmPasskey(): Promise<void>;
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

function deviceApiFrom(api: ApiClient): DeviceApi {
  return {
    status: () => unwrap(api.device.status.$get()),
    registerOptions: (label) =>
      unwrap(call(api.device.register.options.$post, { json: { label } })),
    registerVerify: (response, label) =>
      unwrap(
        call(api.device.register.verify.$post, {
          json: { response: response as never, label },
        }),
      ),
    loginOptions: () => unwrap(api.device.login.options.$post()),
    loginVerify: (response) =>
      unwrap(call(api.device.login.verify.$post, { json: { response: response as never } })),
    reauthOptions: () => unwrap(api.device.reauth.options.$post()),
    reauthVerify: (response) =>
      unwrap(call(api.device.reauth.verify.$post, { json: { response: response as never } })),
  };
}

/** Tope para esperar a que la API borre la cookie al cerrar sesión. */
const LOGOUT_TIMEOUT_MS = 5_000;

interface Props {
  children: ReactNode;
  services?: AuthServices;
  store?: DeviceStore;
  passkeys?: Passkeys;
  /** Para tests: reemplaza el cliente real de la API. */
  apiOverride?: ApiClient;
}

export function AuthProvider({
  children,
  services = supabaseServices,
  store = localDeviceStore,
  passkeys = webPasskeys,
  apiOverride,
}: Props) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  // El cliente de la API y el controlador de dispositivo se crean una sola vez.
  const [{ api, ctl, endSession }] = useState(() => {
    const holder: { api: ApiClient | null } = { api: apiOverride ?? null };
    const ctl = new DeviceController({
      deviceApi: () => deviceApiFrom(holder.api as ApiClient),
      passkeys,
      store,
    });
    /**
     * Cierra la sesión del dispositivo. Espera a que la API borre la cookie del token (con tope)
     * antes de limpiar lo local, para que una navegación no corte el borrado. Con
     * `supabase: true` cierra también la sesión de Supabase. Llamadas simultáneas comparten el cierre.
     */
    let ending: Promise<void> | null = null;
    const logout = async () => {
      await (holder.api as ApiClient).logout.$post(undefined, {
        init: { signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS) },
      });
    };
    const endSession = (error: string | null, opts: { supabase?: boolean } = {}) =>
      (ending ??= (async () => {
        await Promise.allSettled([
          (async () => opts.supabase && (await services.signOut()))(),
          logout(),
        ]);
        store.clear();
        queryClient.clear();
        ctl.setUser(null);
        dispatch({ type: "signed_out", error });
      })().finally(() => {
        ending = null;
      }));
    const onAuthIssue = (issue: AuthIssue) => {
      switch (issue.code) {
        case "not_registered":
          return dispatch({ type: "not_registered" });
        case "device_unregistered":
          return dispatch({ type: "device_checking" });
        case "device_login_required":
          return dispatch({ type: "device_prompt", phase: "login", error: null });
        case "unauthorized":
          return void endSession("Tu sesión venció. Ingresá de nuevo.", { supabase: true });
      }
    };
    holder.api ??= createApiClient(API_URL, {
      getAccessToken: () => services.getAccessToken(),
      getDeviceToken: () => store.getToken(),
      relogin: () => ctl.relogin(),
      onAuthIssue,
    });
    return { api: holder.api, ctl, endSession };
  });
  // Sesión al abrir la app.
  useEffect(() => {
    let cancelled = false;
    services
      .getSession()
      .then((s) => {
        if (cancelled) return;
        if (!s) return dispatch({ type: "no_session" });
        ctl.setUser(s.userId);
        dispatch({ type: "session_restored", verified: store.isVerified(s.userId) });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "no_session" });
      });
    let off: () => void = () => undefined;
    try {
      off = services.onSignedOut(() => void endSession(null));
    } catch {
      /* sin configuración de Supabase: el error se muestra al intentar ingresar */
    }
    return () => {
      cancelled = true;
      off();
    };
  }, [services, store, ctl, endSession]);

  const checkDevice = useCallback(
    async (interactive: boolean) => {
      dispatch({ type: "device_checking" });
      const event = await ctl.check({ interactive });
      if (event) dispatch(event);
    },
    [ctl],
  );

  // Verificación automática al entrar en "device-check/checking".
  const autoStarted = useRef(false);
  const waiting = state.status === "device-check" && state.phase === "checking";
  useEffect(() => {
    if (!waiting) {
      autoStarted.current = false;
      return;
    }
    if (autoStarted.current) return;
    autoStarted.current = true;
    void ctl.check({ interactive: false }).then((event) => event && dispatch(event));
  }, [waiting, ctl]);

  const opened = useCallback(
    (userId: string) => {
      ctl.setUser(userId);
      dispatch({ type: "signed_in" });
    },
    [ctl],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { userId } = await flow(
        services.signIn(email, password),
        "No pudimos iniciar sesión. Probá de nuevo.",
      );
      opened(userId);
    },
    [services, opened],
  );

  const signUp = useCallback(
    async (data: SignupData) => {
      await flow(
        unwrap(call(api.signup.$post, { json: data })),
        "No pudimos crear la cuenta. Probá de nuevo.",
      );
      const { userId } = await flow(
        services.signIn(data.email, data.password),
        "Tu cuenta quedó creada, pero no pudimos abrirla. Ingresá con tu mail y contraseña.",
      );
      opened(userId);
    },
    [api, services, opened],
  );

  const sendRecoveryCode = useCallback(
    (email: string) =>
      flow(services.sendRecoveryCode(email), "No pudimos mandar el código. Probá de nuevo."),
    [services],
  );

  const resetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      const { userId } = await flow(
        services.resetPassword(email, code, password),
        "No pudimos guardar la contraseña. Probá de nuevo.",
      );
      opened(userId);
    },
    [services, opened],
  );

  // Si Supabase falla, igual se cierra la sesión local.
  const signOut = useCallback(() => endSession(null, { supabase: true }), [endSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      api,
      signIn,
      signUp,
      sendRecoveryCode,
      resetPassword,
      checkDevice: () => checkDevice(true),
      confirmPasskey: () => ctl.reauth(),
      signOut,
    }),
    [state, api, signIn, signUp, sendRecoveryCode, resetPassword, checkDevice, ctl, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
