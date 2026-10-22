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
import { unwrap } from "../api/errors";
import { call } from "../api/rpc";
import type { ApiClient } from "../api/types";
import { authReducer, initialAuthState } from "./machine";
import type { AuthState } from "./machine";
import { DeviceController } from "./controller";
import { DEMO_MODE, demoServices, setDemoUser } from "./demo";
import type { DeviceApi, Passkeys } from "./deviceFlow";
import { localDeviceStore } from "./deviceStore";
import type { DeviceStore } from "./deviceStore";
import { webPasskeys } from "./passkeys";
import { AuthFlowError, supabaseServices } from "./services";
import type { AuthServices } from "./services";

interface AuthContextValue {
  state: AuthState;
  api: ApiClient;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  changeEmail(): void;
  /** Registra o verifica la passkey de este dispositivo (gesto del usuario). */
  checkDevice(): Promise<void>;
  /** Modo demo: entra como el usuario elegido en el selector. */
  enterDemo(userId: string): void;
  signOut(): Promise<void>;
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
  };
}

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
  services = DEMO_MODE ? demoServices : supabaseServices,
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
    const endSession = (error: string | null) => {
      store.clearToken();
      queryClient.clear();
      ctl.setUser(null);
      dispatch({ type: "signed_out", error });
    };
    const onAuthIssue = (issue: AuthIssue) => {
      switch (issue.code) {
        case "device_blocked":
          return dispatch({ type: "device_blocked", message: issue.message });
        case "not_registered":
          // En demo, el usuario elegido ya no existe: se vuelve al selector.
          if (DEMO_MODE) {
            setDemoUser(null);
            return endSession("Ese usuario ya no existe. Elegí otro.");
          }
          return dispatch({ type: "not_registered" });
        case "device_unregistered":
          return dispatch({ type: "device_checking" });
        case "device_login_required":
          return dispatch({ type: "device_prompt", phase: "login", error: null });
        case "unauthorized":
          void services.signOut().catch(() => undefined);
          return endSession("Tu sesión venció. Ingresá de nuevo.");
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
        // En demo no hay passkey: la sesión ya está lista.
        dispatch({ type: "session_restored", hasDeviceToken: DEMO_MODE || !!store.getToken() });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "no_session" });
      });
    let off: () => void = () => undefined;
    try {
      off = services.onSignedOut(() => endSession(null));
    } catch {
      /* sin configuración de Supabase: el error se muestra al pedir el código */
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

  const sendCode = useCallback(
    async (email: string) => {
      try {
        await services.sendCode(email);
        dispatch({ type: "code_sent", email });
      } catch (e) {
        dispatch({
          type: "code_failed",
          error:
            e instanceof AuthFlowError ? e.message : "No pudimos mandar el código. Probá de nuevo.",
        });
      }
    },
    [services],
  );

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      try {
        const { userId } = await services.verifyCode(email, code);
        ctl.setUser(userId);
        dispatch({ type: "otp_verified" });
      } catch (e) {
        dispatch({
          type: "code_failed",
          error:
            e instanceof AuthFlowError
              ? e.message
              : "No pudimos verificar el código. Probá de nuevo.",
        });
      }
    },
    [services, ctl],
  );

  const enterDemo = useCallback(
    (userId: string) => {
      setDemoUser(userId);
      ctl.setUser(userId);
      dispatch({ type: "demo_entered" });
    },
    [ctl],
  );

  const signOut = useCallback(async () => {
    try {
      await services.signOut();
    } catch {
      /* igual se cierra la sesión local */
    }
    endSession(null);
  }, [services, endSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      api,
      sendCode,
      verifyCode,
      changeEmail: () => dispatch({ type: "use_other_email" }),
      checkDevice: () => checkDevice(true),
      enterDemo,
      signOut,
    }),
    [state, api, sendCode, verifyCode, checkDevice, enterDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
