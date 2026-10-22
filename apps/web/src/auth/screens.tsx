import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Icon, Logo } from "../components/icons";
import { okMail, MSG } from "../lib/validators";
import { useAuth } from "./AuthProvider";

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

export function LoginScreen({ error }: { error: string | null }) {
  const { sendCode } = useAuth();
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!okMail(value)) return setLocalError(MSG.mail);
    setLocalError(null);
    setBusy(true);
    await sendCode(value);
    setBusy(false);
  }
  const shown = localError ?? error;

  return (
    <AuthLayout>
      <div className="head">
        <h1>Ingresá a Cuidarte+</h1>
        <p className="sub">
          Te mandamos un código de 6 dígitos por mail. No hace falta contraseña.
        </p>
      </div>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="login-email">Mail</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={shown ? "login-err" : undefined}
          />
          {shown && (
            <p className="err" id="login-err" role="alert">
              {shown}
            </p>
          )}
        </div>
        <button className="primary-btn" type="submit" disabled={busy}>
          <Icon name="mail" /> {busy ? "Enviando…" : "Enviarme el código"}
        </button>
      </form>
      <p className="foot-note">
        Solo pueden ingresar las cuentas que dio de alta el administrador.
      </p>
    </AuthLayout>
  );
}

const RESEND_SECONDS = 30;

export function OtpScreen({ email, error }: { email: string; error: string | null }) {
  const { verifyCode, sendCode, changeEmail } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setBusy(true);
    await verifyCode(email, code.trim());
    setBusy(false);
  }
  async function resend() {
    setResent(false);
    await sendCode(email);
    setResent(true);
    setWait(RESEND_SECONDS);
  }

  return (
    <AuthLayout>
      <div className="head">
        <h1>Revisá tu mail</h1>
        <p className="sub">
          Te mandamos un código de 6 dígitos a <b className="who-mail">{email}</b>.
        </p>
      </div>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="otp-code">Código</label>
          <input
            id="otp-code"
            type="text"
            className="otp-input tnum"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-describedby={error ? "otp-err" : undefined}
          />
          {error && (
            <p className="err" id="otp-err" role="alert">
              {error}
            </p>
          )}
          {resent && !error && <p className="optional">Te mandamos un código nuevo.</p>}
        </div>
        <button className="primary-btn" type="submit" disabled={busy || code.length < 6}>
          <Icon name="check" /> {busy ? "Verificando…" : "Ingresar"}
        </button>
        <div className="btn-row">
          <button type="button" className="ghost" onClick={resend} disabled={wait > 0}>
            {wait > 0 ? `Reenviar código (${wait} s)` : "Reenviar código"}
          </button>
          <button type="button" className="link-btn" onClick={changeEmail}>
            Usar otro mail
          </button>
        </div>
      </form>
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

/** Muestra la pantalla que corresponde al estado del ingreso; con sesión lista, la app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  switch (state.status) {
    case "loading":
      return <Splash />;
    case "signed-out":
      return <LoginScreen error={state.error} />;
    case "otp":
      return <OtpScreen email={state.email} error={state.error} />;
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
