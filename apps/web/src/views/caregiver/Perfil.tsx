import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { ApiError, errorMessage } from "../../api/errors";
import { useDeleteAccount, useDeviceStatus, useMe, useSaveProfile } from "../../api/queries/me";
import type { Me } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Async, BackLink, Field } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { ago, birthToIso, isoToBirth } from "../../lib/dates";
import { MSG, okMail, okPhone } from "../../lib/validators";

type Errors = Partial<Record<"first" | "last" | "email" | "phone" | "birth" | "form", string>>;

function ProfileForm({ me }: { me: Me }) {
  const p = me.profile ?? {};
  const save = useSaveProfile();
  const { toast } = useToast();
  const [first, setFirst] = useState(p.first_name ?? "");
  const [last, setLast] = useState(p.last_names ?? "");
  const [email, setEmail] = useState(p.email ?? "");
  const [phone, setPhone] = useState(p.phone ?? "");
  const [birth, setBirth] = useState(isoToBirth(p.birth_date));
  const [errors, setErrors] = useState<Errors>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = {
      first: first.trim(),
      last: last.trim(),
      email: email.trim(),
      phone: phone.trim(),
      birth: birth.trim(),
    };
    const birthIso = birthToIso(v.birth);
    const next: Errors = {};
    if (!v.first) next.first = "Escribí tu nombre.";
    if (!v.last) next.last = "Escribí tus apellidos.";
    if (!okMail(v.email)) next.email = MSG.mail;
    if (!okPhone(v.phone)) next.phone = MSG.phone;
    if (!birthIso) next.birth = MSG.birth;
    setErrors(next);
    if (Object.keys(next).length || !birthIso) return;
    try {
      await save.mutateAsync({
        first_name: v.first,
        last_names: v.last,
        phone: v.phone,
        email: v.email,
        birth_date: birthIso,
      });
      toast(
        <>
          <Icon name="check" /> <span>Cambios guardados.</span>
        </>,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") setErrors({ email: err.message });
      else setErrors({ form: errorMessage(err) });
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h2 className="section">Tus datos</h2>
      <div className="two">
        <Field id="p-nombre" label="Nombre" error={errors.first}>
          <input
            type="text"
            id="p-nombre"
            autoComplete="given-name"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </Field>
        <Field id="p-apellidos" label="Apellidos" error={errors.last}>
          <input
            type="text"
            id="p-apellidos"
            autoComplete="family-name"
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />
        </Field>
      </div>
      <Field id="p-email" label="Mail" error={errors.email}>
        <input
          type="email"
          id="p-email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field
        id="p-phone"
        label="Celular con código de área"
        hint="Sin el 0 ni el 15 adelante, por ejemplo 342 155 123456."
        error={errors.phone}
      >
        <input
          type="text"
          id="p-phone"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Field
        id="p-birth"
        label="Fecha de nacimiento"
        hint="Escribí día/mes/año completo, por ejemplo 14/05/1980. La usamos para saludarte en tu cumpleaños."
        error={errors.birth}
      >
        <input
          type="text"
          id="p-birth"
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          value={birth}
          onChange={(e) => setBirth(e.target.value)}
        />
      </Field>
      <p className="optional" style={{ margin: 0 }}>
        Al guardar aceptás los{" "}
        <Link to="/terminos">términos, condiciones y la política de privacidad</Link>.
      </p>
      {errors.form && (
        <p className="err" role="alert">
          {errors.form}
        </p>
      )}
      <button className="primary-btn auto" type="submit" disabled={save.isPending}>
        Guardar cambios
      </button>
    </form>
  );
}

function DeviceCard() {
  const q = useDeviceStatus();
  return (
    <section className="group">
      <h2 className="section">Tu dispositivo</h2>
      <div className="card rcard" style={{ gap: 10 }}>
        <Async query={q}>
          {(d) => (
            <div className="rhead">
              <span className="badge">
                <Icon name="phone" />
              </span>
              <div>
                <h3 style={{ fontSize: "1.1rem" }}>{d.label || "Sin dispositivo registrado"}</h3>
                <p>
                  {d.registered && d.last_seen_at
                    ? `Último acceso ${ago(d.last_seen_at)}`
                    : "Se registra la próxima vez que entres."}
                </p>
              </div>
            </div>
          )}
        </Async>
        <p className="optional" style={{ margin: 0 }}>
          Tu cuenta funciona en un solo dispositivo. Si cambiás de celular, pedile al administrador
          que libere tu cuenta.
        </p>
      </div>
    </section>
  );
}

function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const del = useDeleteAccount();
  const { signOut } = useAuth();

  async function remove() {
    setErr(null);
    try {
      await del.mutateAsync();
      await signOut();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <section className="group">
      <h2 className="section">Borrar mi cuenta</h2>
      <p className="sub" style={{ fontSize: "1rem" }}>
        Se borran tu perfil, tus registros de bienestar, tus turnos y tus recordatorios. No se puede
        deshacer.
      </p>
      <div id="del-zone">
        {confirming ? (
          <div className="confirm">
            <p>
              ¿Seguro? Se borran tu perfil, tus registros, tus turnos y tus recordatorios, y tu
              cuenta deja de existir.
            </p>
            {err && (
              <p className="err" role="alert">
                {err}
              </p>
            )}
            <div className="btn-row">
              <button className="danger" onClick={() => void remove()} disabled={del.isPending}>
                Sí, borrar todo
              </button>
              <button className="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button className="danger-outline" onClick={() => setConfirming(true)}>
            Borrar mi cuenta
          </button>
        )}
      </div>
    </section>
  );
}

export function Perfil() {
  const meQ = useMe();
  return (
    <div className="page narrow">
      <BackLink to="/inicio">Inicio</BackLink>
      <div className="head">
        <h1>Mi perfil</h1>
        <p className="sub">{meQ.data?.profile?.email || "Sin mail cargado"}</p>
      </div>
      <Async query={meQ}>{(me) => <ProfileForm me={me} />}</Async>
      <hr className="sep" />
      <DeviceCard />
      <DeleteAccount />
    </div>
  );
}
