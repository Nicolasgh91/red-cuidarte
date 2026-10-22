import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, errorMessage } from "../../api/errors";
import {
  useAddMedication,
  useAddPatient,
  useAdminCaregivers,
  useAdminPatients,
  useRemoveMedication,
} from "../../api/queries/admin";
import type { AdminCaregiver, AdminPatient } from "../../api/types";
import { Async, Field } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { parseTimes } from "../../lib/dates";
import { okMail, MSG } from "../../lib/validators";

function MedicationForm({ patientId }: { patientId: string }) {
  const add = useAddMedication();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [times, setTimes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const d = dose.trim();
    const parsed = parseTimes(times);
    if (!n || !d || (!parsed.bad && !parsed.times.length) || parsed.bad) {
      return setErr(
        parsed.bad
          ? `«${parsed.bad}» no es un horario válido. Usá HH:MM, separados por coma.`
          : "Completá medicamento, dosis y al menos un horario.",
      );
    }
    setErr(null);
    try {
      await add.mutateAsync({ patientId, name: n, dose: d, times: parsed.times });
      setName("");
      setDose("");
      setTimes("");
    } catch (error) {
      setErr(errorMessage(error));
    }
  }

  return (
    <>
      <form className="four" onSubmit={submit} noValidate>
        <Field id={`mn-${patientId}`} label="Medicamento">
          <input
            type="text"
            id={`mn-${patientId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id={`md-${patientId}`} label="Dosis">
          <input
            type="text"
            id={`md-${patientId}`}
            placeholder="10 mg"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
          />
        </Field>
        <Field id={`mh-${patientId}`} label="Horarios">
          <input
            type="text"
            id={`mh-${patientId}`}
            placeholder="08:00, 20:00"
            value={times}
            onChange={(e) => setTimes(e.target.value)}
          />
        </Field>
        <button
          className="ghost"
          type="submit"
          style={{ justifyContent: "center", padding: 12 }}
          disabled={add.isPending}
        >
          <Icon name="plus" /> Agregar
        </button>
      </form>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </>
  );
}

function PatientCard({
  patient,
  caregivers,
}: {
  patient: AdminPatient;
  caregivers: AdminCaregiver[];
}) {
  const removeMed = useRemoveMedication();
  const { toast } = useToast();
  const cgs = patient.caregiver_ids
    .map((id) => caregivers.find((c) => c.id === id))
    .filter((c): c is AdminCaregiver => !!c)
    .map((c) => `${c.first_name} ${c.last_names}`.trim());

  return (
    <section className="card pcard">
      <div className="row-between">
        <h2 className="section" style={{ fontSize: "1.25rem" }}>
          {`${patient.first_name} ${patient.last_name}`.trim()}
        </h2>
        <span className="optional">
          {cgs.length ? `Cuidan: ${cgs.join(", ")}` : "Sin cuidadores asignados"}
        </span>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Medicamento</th>
              <th>Dosis</th>
              <th>Horarios</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patient.medications.length ? (
              patient.medications.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.dose}</td>
                  <td className="n">{m.times.join(", ")}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="icon-btn"
                      aria-label={`Quitar ${m.name}`}
                      onClick={() =>
                        removeMed.mutate(m.id, { onError: (e) => toast(errorMessage(e)) })
                      }
                    >
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="optional">
                  Sin medicación cargada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <MedicationForm patientId={patient.id} />
    </section>
  );
}

export function AddPatientForm() {
  const add = useAddPatient();
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
      toast("Persona cuidada agregada.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") setErrors({ email: err.message });
      else setErrors({ form: errorMessage(err) });
    }
  }

  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Agregar persona cuidada
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
          hint="Sin mail es solo una ficha: la persona no puede ingresar a la app."
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

export function AdminPacientes() {
  const patients = useAdminPatients();
  const caregivers = useAdminCaregivers();
  return (
    <div className="page">
      <div className="head">
        <h1>Personas cuidadas</h1>
        <p className="sub">Nombre, apellido y medicación.</p>
      </div>
      <p className="note">
        La medicación es un dato de salud: la ven solo el administrador y los cuidadores asignados.
        Cada toma aparece como tarea en el checklist diario del cuidador.
      </p>
      <Async query={patients}>
        {(list) => (
          <Async query={caregivers}>
            {(cgs) => (
              <>
                {list.map((p) => (
                  <PatientCard key={p.id} patient={p} caregivers={cgs} />
                ))}
              </>
            )}
          </Async>
        )}
      </Async>
      <AddPatientForm />
    </div>
  );
}
