import { useEffect, useState } from "react";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { errorMessage } from "../api/errors";
import { useContent } from "../api/queries/content";
import { Field } from "../components/common";
import { Icon, Logo } from "../components/icons";
import type { IconName } from "../components/icons";
import { birthToIso } from "../lib/dates";
import { CONTACT_EMAIL, DISCLAIMER, quoteOfDay } from "../lib/labels";
import { MSG, okMail, okPhone } from "../lib/validators";
import { Terminos } from "../views/shared/Terminos";
import { useAuth } from "./AuthProvider";
import type { SignupRole } from "./AuthProvider";

/** Mínimo que pide Supabase Auth (configurado en el panel, ver docs/ops.md). */
export const MIN_PASSWORD = 8;

/** Fondo de atardecer de las pantallas sin sesión, con el aviso médico al pie. */
function AuthScene({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth-scene">
      <main id="main" tabIndex={-1} className={wide ? "auth-main wide" : "auth-main"}>
        {children}
        <p className="disclaimer auth-disclaimer">{DISCLAIMER}</p>
      </main>
    </div>
  );
}

/** Marca y lema. En la landing es el título de la página; en el resto, solo un encabezado. */
function Brand({ title = false }: { title?: boolean }) {
  const { landing } = useContent();
  const logo = (
    <Link to="/" className="auth-logo">
      <Logo />
      Cuidarte+
    </Link>
  );
  return (
    <header className="auth-brand">
      {title ? <h1>{logo}</h1> : logo}
      <p className="auth-tagline">{landing.tagline}</p>
      <p className="auth-lead">{landing.lead}</p>
    </header>
  );
}

function AuthCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <Icon name="leaf" className="auth-card-deco" />
      <div className="head">
        <h1 id="auth-title">{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function IconInput({ icon, ...props }: { icon: IconName } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="input-icon">
      <Icon name={icon} />
      <input {...props} />
    </div>
  );
}

function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="input-icon">
      <Icon name="lock" />
      <input {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        className="input-toggle"
        aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
      >
        <Icon name={shown ? "eyeOff" : "eye"} />
      </button>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="err" role="alert">
      {message}
    </p>
  );
}

export function Landing() {
  const { landing, quotes } = useContent();
  useEffect(() => {
    document.title = `Cuidarte+ · ${landing.tagline}`;
  }, [landing.tagline]);
  return (
    <AuthScene wide>
      <section className="landing-hero">
        <Brand title />
        <div className="landing-cta">
          <Link className="primary-btn" to="/ingresar">
            Ingresar <Icon name="arrowR" />
          </Link>
        </div>
      </section>

      <section className="landing-panel" aria-labelledby="landing-features">
        <h2 id="landing-features">Qué te ofrece</h2>
        <ul className="landing-features">
          {landing.features.map((f) => (
            <li key={f.title}>
              <span className="badge">
                <Icon name={f.icon as IconName} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-panel" aria-labelledby="landing-steps">
        <h2 id="landing-steps">Cómo funciona</h2>
        <ol className="landing-steps">
          {landing.steps.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="landing-foot">
        <p className="auth-quote">{quoteOfDay(new Date(), quotes)}</p>
        <nav aria-label="Información legal">
          <Link to="/privacidad">Privacidad</Link>
          <Link to="/terminos">Términos</Link>
        </nav>
      </footer>
    </AuthScene>
  );
}

export function LoginScreen({ error }: { error: string | null }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!okMail(value)) return setLocalError(MSG.mail);
    if (!password) return setLocalError("Escribí tu contraseña.");
    setLocalError(null);
    setBusy(true);
    try {
      await signIn(value, password);
    } catch (err) {
      setLocalError(errorMessage(err));
      setBusy(false);
    }
  }
  const shown = localError ?? error;

  return (
    <AuthScene>
      <Brand />
      <AuthCard title="Ingresar">
        <form className="form" onSubmit={submit} noValidate>
          <Field id="login-email" label="Correo electrónico">
            <IconInput
              icon="mail"
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field id="login-pass" label="Contraseña">
            <PasswordInput
              id="login-pass"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <FormError message={shown} />
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? "Ingresando…" : "Ingresar"} <Icon name="arrowR" />
          </button>
        </form>
        <div className="auth-links">
          <Link to="/recuperar" state={{ email: email.trim() }}>
            ¿Primera vez u olvidaste tu contraseña?
          </Link>
          <Link to="/registro">¿No tenés cuenta? Creá una</Link>
        </div>
        <p className="auth-help">
          ¿Problemas para ingresar? Escribinos a{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </AuthCard>
    </AuthScene>
  );
}

type RegisterErrors = Partial<
  Record<
    "role" | "first" | "last" | "phone" | "birth" | "email" | "pass" | "pass2" | "terms",
    string
  >
>;

/** Roles que se pueden elegir al registrarse: el de administrador se da desde la base de datos. */
const SIGNUP_ROLES = [
  { value: "caregiver", label: "Soy cuidador/a", hint: "Acompaño a personas y llevo sus turnos." },
  { value: "patient", label: "Soy paciente", hint: "Quiero que me cuiden y ver mi información." },
] as const;

export function RegisterScreen() {
  const { signUp } = useAuth();
  const [role, setRole] = useState<SignupRole | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    const birthIso = birthToIso(birth.trim());
    const next: RegisterErrors = {};
    if (!role) next.role = "Elegí cómo vas a usar Cuidarte+.";
    if (!first.trim()) next.first = "Escribí tu nombre.";
    if (!last.trim())
      next.last = role === "patient" ? "Escribí tu apellido." : "Escribí tus apellidos.";
    if (role === "caregiver") {
      if (!okPhone(phone.trim())) next.phone = MSG.phone;
      if (!birthIso) next.birth = MSG.birth;
    }
    if (!okMail(mail)) next.email = MSG.mail;
    if (pass.length < MIN_PASSWORD)
      next.pass = `La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`;
    if (pass2 !== pass) next.pass2 = "Las contraseñas no coinciden.";
    if (!terms) next.terms = "Para crear la cuenta tenés que aceptar los términos.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length || !role) return;
    setBusy(true);
    try {
      if (role === "patient") {
        await signUp({
          role,
          first_name: first.trim(),
          last_name: last.trim(),
          email: mail,
          password: pass,
        });
      } else {
        await signUp({
          role,
          first_name: first.trim(),
          last_names: last.trim(),
          phone: phone.trim(),
          birth_date: birthIso as string,
          email: mail,
          password: pass,
        });
      }
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthScene>
      <Brand />
      <AuthCard title="Crear cuenta" sub="Lleva un minuto.">
        <form className="form" onSubmit={submit} noValidate>
          <fieldset
            className="field role-choice"
            aria-describedby={errors.role ? "reg-role-err" : undefined}
          >
            <legend>Quiero registrarme como</legend>
            {SIGNUP_ROLES.map((r) => (
              <label className="check" key={r.value}>
                <input
                  type="radio"
                  name="reg-role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                />
                <span>
                  {r.label}
                  <small>{r.hint}</small>
                </span>
              </label>
            ))}
            {errors.role && (
              <p className="err" id="reg-role-err" role="alert">
                {errors.role}
              </p>
            )}
          </fieldset>
          <div className="two">
            <Field id="reg-first" label="Nombre" error={errors.first}>
              <input
                type="text"
                id="reg-first"
                autoComplete="given-name"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
              />
            </Field>
            <Field
              id="reg-last"
              label={role === "patient" ? "Apellido" : "Apellidos"}
              error={errors.last}
            >
              <input
                type="text"
                id="reg-last"
                autoComplete="family-name"
                value={last}
                onChange={(e) => setLast(e.target.value)}
              />
            </Field>
          </div>
          {role === "caregiver" && (
            <div className="two">
              <Field
                id="reg-phone"
                label="Celular"
                hint="Con código de área, sin 0 ni 15."
                error={errors.phone}
              >
                <input
                  type="text"
                  id="reg-phone"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field
                id="reg-birth"
                label="Fecha de nacimiento"
                hint="dd/mm/aaaa"
                error={errors.birth}
              >
                <input
                  type="text"
                  id="reg-birth"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  autoComplete="bday"
                  value={birth}
                  onChange={(e) => setBirth(e.target.value)}
                />
              </Field>
            </div>
          )}
          <Field id="reg-email" label="Correo electrónico" error={errors.email}>
            <IconInput
              icon="mail"
              id="reg-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field
            id="reg-pass"
            label="Contraseña"
            hint={`Al menos ${MIN_PASSWORD} caracteres.`}
            error={errors.pass}
          >
            <PasswordInput
              id="reg-pass"
              autoComplete="new-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </Field>
          <Field id="reg-pass2" label="Repetí la contraseña" error={errors.pass2}>
            <PasswordInput
              id="reg-pass2"
              autoComplete="new-password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
            />
          </Field>
          <div className="field">
            <label className="check auth-terms">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                aria-describedby={errors.terms ? "reg-terms-err" : undefined}
              />
              <span>
                Leí y acepto los <Link to="/terminos">términos</Link> y la{" "}
                <Link to="/privacidad">política de privacidad</Link>.
              </span>
            </label>
            {errors.terms && (
              <p className="err" id="reg-terms-err" role="alert">
                {errors.terms}
              </p>
            )}
          </div>
          <FormError message={formError} />
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? "Creando la cuenta…" : "Crear cuenta"} <Icon name="arrowR" />
          </button>
        </form>
        <div className="auth-links">
          <Link to="/ingresar">¿Ya tenés cuenta? Ingresá</Link>
        </div>
      </AuthCard>
    </AuthScene>
  );
}

const RESEND_SECONDS = 30;

/**
 * Definir o cambiar la contraseña con un código por mail. Es también el primer ingreso de las
 * cuentas que da de alta el administrador, que se crean sin contraseña.
 */
export function RecoverScreen() {
  const { sendRecoveryCode, resetPassword } = useAuth();
  const initial = (useLocation().state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(initial);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(to: string) {
    setError(null);
    setBusy(true);
    try {
      await sendRecoveryCode(to);
      setSentTo(to);
      setWait(RESEND_SECONDS);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!okMail(value)) return setError(MSG.mail);
    await send(value);
  }

  async function resend() {
    setResent(false);
    if (sentTo && (await send(sentTo))) setResent(true);
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    if (code.length < 6) return setError("Escribí el código de 6 dígitos que te llegó.");
    if (pass.length < MIN_PASSWORD)
      return setError(`La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`);
    if (pass2 !== pass) return setError("Las contraseñas no coinciden.");
    setError(null);
    setBusy(true);
    try {
      await resetPassword(sentTo, code, pass);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!sentTo) {
    return (
      <AuthScene>
        <Brand />
        <AuthCard
          title="Definí tu contraseña"
          sub="Si es tu primera vez o te olvidaste la contraseña, te mandamos un código de 6 dígitos por mail."
        >
          <form className="form" onSubmit={submitEmail} noValidate>
            <Field id="rec-email" label="Correo electrónico">
              <IconInput
                icon="mail"
                id="rec-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <FormError message={error} />
            <button className="primary-btn" type="submit" disabled={busy}>
              <Icon name="mail" /> {busy ? "Enviando…" : "Enviarme el código"}
            </button>
          </form>
          <div className="auth-links">
            <Link to="/ingresar">Volver a ingresar</Link>
          </div>
        </AuthCard>
      </AuthScene>
    );
  }

  return (
    <AuthScene>
      <Brand />
      <AuthCard
        title="Revisá tu mail"
        sub={
          <>
            Si hay una cuenta con <b className="who-mail">{sentTo}</b>, te llegó un código de 6
            dígitos.
          </>
        }
      >
        <form className="form" onSubmit={submitReset} noValidate>
          <Field id="rec-code" label="Código">
            <input
              id="rec-code"
              type="text"
              className="otp-input tnum"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          {resent && !error && <p className="optional">Te mandamos un código nuevo.</p>}
          <Field
            id="rec-pass"
            label="Contraseña nueva"
            hint={`Al menos ${MIN_PASSWORD} caracteres.`}
          >
            <PasswordInput
              id="rec-pass"
              autoComplete="new-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </Field>
          <Field id="rec-pass2" label="Repetí la contraseña">
            <PasswordInput
              id="rec-pass2"
              autoComplete="new-password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <button className="primary-btn" type="submit" disabled={busy}>
            <Icon name="check" /> {busy ? "Guardando…" : "Guardar e ingresar"}
          </button>
          <div className="btn-row">
            <button type="button" className="ghost" onClick={resend} disabled={busy || wait > 0}>
              {wait > 0 ? `Reenviar código (${wait} s)` : "Reenviar código"}
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setSentTo(null);
                setCode("");
                setError(null);
                setResent(false);
              }}
            >
              Usar otro mail
            </button>
          </div>
        </form>
      </AuthCard>
    </AuthScene>
  );
}

/** Términos sin sesión (el registro los enlaza); con sesión se ven dentro de la app. */
function PublicTerminos() {
  return (
    <div className="shell bare">
      <header className="top">
        <Link to="/" className="logo">
          <Logo />
          Cuidarte+
        </Link>
      </header>
      <main id="main" tabIndex={-1}>
        <Terminos />
      </main>
    </div>
  );
}

/**
 * Rutas sin sesión. Cualquier otra ruta (por ejemplo, una de la app después de que venció la
 * sesión) lleva a ingresar, donde se ve el motivo.
 */
export function PublicRoutes({ error }: { error: string | null }) {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/ingresar" element={<LoginScreen error={error} />} />
      <Route path="/registro" element={<RegisterScreen />} />
      <Route path="/recuperar" element={<RecoverScreen />} />
      <Route path="/terminos" element={<PublicTerminos />} />
      <Route path="*" element={<Navigate to="/ingresar" replace />} />
    </Routes>
  );
}
