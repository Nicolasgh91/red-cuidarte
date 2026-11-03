import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, errorMessage } from "../api/errors";
import { MSG, okMail } from "../lib/validators";
import { Field } from "./common";
import { Icon } from "./icons";
import { useToast } from "./Toasts";

interface NewPatientInput {
  first_name: string;
  last_name: string;
  email?: string;
}

/** Lo mínimo que necesita el formulario de una mutación de TanStack Query. */
interface NewPatientMutation {
  mutateAsync(input: NewPatientInput): Promise<unknown>;
  isPending: boolean;
}

/** Alta de un paciente: la usan el admin y el cuidador/a (que queda asignado a él o ella). */
export function AddPatientForm({ mutation: add }: { mutation: NewPatientMutation }) {
  const { toast } = useToast();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<"first" | "last" | "email" | "form", string>>
  >({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = { first: first.trim(), last: last.trim(), email: email.trim() };
    const next: typeof errors = {};
    if (!v.first) next.first = "Falta el nombre.";
    if (!v.last) next.last = "Falta el apellido.";
    if (v.email && !okMail(v.email)) next.email = MSG.mail;
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await add.mutateAsync({
        first_name: v.first,
        last_name: v.last,
        ...(v.email ? { email: v.email } : {}),
      });
      setFirst("");
      setLast("");
      setEmail("");
      toast("Paciente agregado.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") setErrors({ email: err.message });
      else setErrors({ form: errorMessage(err) });
    }
  }

  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Agregar paciente
      </h2>
      <form className="form" onSubmit={submit} noValidate>
        <div className="two">
          <Field id="ap-nombre" label="Nombre" error={errors.first}>
            <input
              type="text"
              id="ap-nombre"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
          </Field>
          <Field id="ap-apellido" label="Apellido" error={errors.last}>
            <input
              type="text"
              id="ap-apellido"
              value={last}
              onChange={(e) => setLast(e.target.value)}
            />
          </Field>
        </div>
        <Field
          id="ap-email"
          label={
            <>
              Mail <span className="light">(opcional, para que pueda ingresar)</span>
            </>
          }
          hint="Sin mail es solo una ficha: no puede ingresar a la app. Con mail, ingresa tocando «¿Primera vez u olvidaste tu contraseña?» y pidiendo el código por mail."
          error={errors.email}
        >
          <input
            type="email"
            id="ap-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {errors.form && (
          <p className="err" role="alert">
            {errors.form}
          </p>
        )}
        <button className="primary-btn auto" type="submit" disabled={add.isPending}>
          <Icon name="plus" /> Agregar
        </button>
      </form>
    </section>
  );
}
