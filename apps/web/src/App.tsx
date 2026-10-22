import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { BrowserRouter, Route, Routes } from "react-router";
import { errorMessage } from "./api/errors";
import { useMe } from "./api/queries/me";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthGate, Splash } from "./auth/screens";
import { AppShell } from "./components/AppShell";
import { LayerProvider } from "./components/Layer";
import { ToastProvider } from "./components/Toasts";
import { RemindersRuntime, createNativeReminderScheduler } from "./reminders";
import { Privacidad } from "./views/shared/Privacidad";

const nativeScheduler = () => createNativeReminderScheduler();

/** Pide el rol a la API (GET /me) y arma la app de ese rol. */
function RoleApp() {
  const me = useMe();
  const { signOut } = useAuth();
  const qc = useQueryClient();

  if (me.isPending) return <Splash />;
  if (me.isError) {
    return (
      <div className="shell bare">
        <header className="top" />
        <main id="main" tabIndex={-1}>
          <div className="page narrow">
            <div className="head">
              <h1>No pudimos abrir tu cuenta</h1>
              <p className="sub">{errorMessage(me.error)}</p>
            </div>
            <div className="btn-row">
              <button
                className="primary-btn sm"
                onClick={() => void qc.invalidateQueries({ queryKey: ["me"] })}
              >
                Reintentar
              </button>
              <button className="ghost" onClick={() => void signOut()}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }
  const shell = <AppShell me={me.data} />;
  if (me.data.role !== "caregiver") return shell;
  // En la app Android los avisos son notificaciones locales (suenan con la app cerrada).
  return (
    <RemindersRuntime createScheduler={Capacitor.isNativePlatform() ? nativeScheduler : undefined}>
      {shell}
    </RemindersRuntime>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pública, sin sesión: la pide Google Play (y la App Store) como URL de la política. */}
        <Route path="/privacidad" element={<Privacidad />} />
        <Route
          path="*"
          element={
            <ToastProvider>
              <AuthProvider>
                <AuthGate>
                  <LayerProvider>
                    <RoleApp />
                  </LayerProvider>
                </AuthGate>
              </AuthProvider>
            </ToastProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
