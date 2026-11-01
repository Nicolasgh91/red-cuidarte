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
        <h1>{phase === "register" ? "Creá tu passkey" : "Verificá tu passkey"}</h1>
        <p className="sub">
          Para proteger tu cuenta usamos una passkey (llave de acceso) que se desbloquea con tu
          huella, tu rostro o el bloqueo de pantalla. Si la guardaste en tu teléfono, podés usarla
          desde otro equipo con el código QR.
        </p>
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {phase === "checking" ? (
        <p className="sub" role="status">
          Verificando tu passkey…
        </p>
      ) : (
        <button className="primary-btn" type="button" onClick={() => void checkDevice()}>
          <Icon name="shield" />
          {phase === "register" ? "Crear mi passkey" : "Verificar con mi passkey"}
        </button>
      )}
      <p className="optional">
        ¿Necesitás ayuda? Escribinos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <div className="btn-row">
        <button type="button" className="link-btn" onClick={() => void signOut()}>
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
    case "passkey":
      return <DeviceScreen phase={state.phase} error={state.error} />;
    case "not-registered":
      return <NotRegisteredScreen />;
    case "ready":
      return <>{children}</>;
  }
}
