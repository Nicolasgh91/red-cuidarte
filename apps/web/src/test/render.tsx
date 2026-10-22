import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import type { ApiClient } from "../api/types";
import { AuthContext } from "../auth/AuthProvider";
import { LayerProvider } from "../components/Layer";
import { ToastProvider } from "../components/Toasts";

/** Respuesta ok de la API (lo mínimo que usa `unwrap`). */
export const ok = <T,>(data: T) => ({ ok: true, status: 200, json: async () => data });
/** Respuesta de error con el cuerpo `{ error: { code, message } }`. */
export const fail = (status: number, code: string, message: string) => ({
  ok: false,
  status,
  json: async () => ({ error: { code, message } }),
});

/** Cliente de API falso: solo las rutas que cada test define (el resto no existe). */
export const fakeApi = (routes: Record<string, unknown>): ApiClient =>
  routes as unknown as ApiClient;

export function renderWithApp(
  ui: ReactElement,
  { api, route = "/" }: { api: ApiClient; route?: string },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const noop = async () => undefined;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <AuthContext.Provider
            value={{
              state: { status: "ready" },
              api,
              sendCode: noop,
              verifyCode: noop,
              changeEmail: () => undefined,
              checkDevice: noop,
              signOut: noop,
            }}
          >
            <LayerProvider>{ui}</LayerProvider>
          </AuthContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
