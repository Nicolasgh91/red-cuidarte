import type { ReactNode } from "react";
import { Icon, Logo } from "../components/icons";
import { CONTACT_EMAIL } from "../lib/labels";
import { useAuth } from "./AuthProvider";
import { PublicRoutes } from "./public";

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell bare">
      <header className="top">
        <span className="logo">
          <Logo />
          Cuidarte+
        </span>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page narrow">{children}</div>
      </main>
    </div>
  );
}

export function Splash() {
  return (
    <AuthLayout>
      <p className="sub" role="status">
        Cargando…
      </p>
    </AuthLayout>
  );
}

export function DeviceScreen({
  phase,
  error,
}: {
  phase: "checking" | "register" | "login";
  error: string | null;
}) {
  const { checkDevice, signOut } = useAuth();
  return (
    <AuthLayout>
      <div className="head">
        <h1>{phase === "register" ? "Registrá este dispositivo" : "Verificá tu dispositivo"}</h1>
        <p className="sub">
          Tu cuenta funciona en un solo dispositivo. Para protegerla, usamos una llave de acceso que
          se guarda en este equipo (huella, rostro o bloqueo de pantalla).
        </p>
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {phase === "checking" ? (
        <p className="sub" role="status">
          Verificando este dispositivo…
        </p>
      ) : (
        <button className="primary-btn" type="button" onClick={() => void checkDevice()}>
          <Icon name="shield" />
          {phase === "register" ? "Registrar este dispositivo" : "Verificar con mi dispositivo"}
        </button>
      )}
      <div className="btn-row">
        <button type="button" className="link-btn" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </div>
    </AuthLayout>
  );
}

export function BlockedScreen({ message }: { message: string }) {
  const { checkDevice, signOut } = useAuth();
  return (
    <AuthLayout>
      <div className="head">
        <h1>Este dispositivo está bloqueado</h1>
      </div>
      <div className="confirm" role="alert">
        <p>{message}</p>
      </div>
      <p className="optional">
        Ya avisamos al administrador. Cuando libere tu cuenta o autorice este dispositivo, tocá
        «Reintentar».
      </p>
      <p className="optional">
        ¿Necesitás ayuda? Escribinos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <div className="btn-row">
        <button type="button" className="primary-btn sm" onClick={() => void checkDevice()}>
          Reintentar
        </button>
        <button type="button" className="ghost" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </div>
    </AuthLayout>
  );
}

export function NotRegisteredScreen() {
  const { signOut } = useAuth();
  return (
    <AuthLayout>
      <div className="head">
        <h1>Tu cuenta todavía no está dada de alta</h1>
        <p className="sub">Pedile al administrador que la cargue y volvé a ingresar.</p>
      </div>
      <div className="btn-row">
        <button type="button" className="ghost" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </div>
    </AuthLayout>
  );
}

/** Sin sesión, las rutas públicas (landing, ingreso, registro); con sesión, el paso que falta o la app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  switch (state.status) {
    case "loading":
      return <Splash />;
    case "signed-out":
      return <PublicRoutes error={state.error} />;
    case "device-check":
      return <DeviceScreen phase={state.phase} error={state.error} />;
    case "blocked":
      return <BlockedScreen message={state.message} />;
    case "not-registered":
      return <NotRegisteredScreen />;
    case "ready":
      return <>{children}</>;
  }
}
