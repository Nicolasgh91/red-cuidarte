import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, errorMessage } from "../../api/errors";
import {
  useAddCaregiver,
  useAdminAdmins,
  useAdminCaregivers,
  useAdminPatients,
  useAssignPatients,
} from "../../api/queries/admin";
import type { AdminCaregiver, AdminPatient } from "../../api/types";
import { Async, Field } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { birthToIso, isoToBirth } from "../../lib/dates";
import { okMail, okPhone } from "../../lib/validators";

const pFull = (p: AdminPatient) => `${p.first_name} ${p.last_name}`.trim();

function AssignCell({
  caregiver,
  patients,
}: {
  caregiver: AdminCaregiver;
  patients: AdminPatient[];
}) {
  const assign = useAssignPatients();
  const { toast } = useToast();
  const names = caregiver.patient_ids
    .map((id) => patients.find((p) => p.id === id)?.first_name)
    .filter(Boolean)
    .join(", ");

  function change(pid: string, on: boolean) {
    const ids = on
      ? [...new Set([...caregiver.patient_ids, pid])]
      : caregiver.patient_ids.filter((x) => x !== pid);
    assign.mutate(
      { id: caregiver.id, patient_ids: ids },
      {
        onSuccess: () => toast("Asignación guardada."),
        onError: (e) => toast(errorMessage(e)),
      },
    );
  }

  return (
    <td>
      {names || "—"}
      <details className="assign">
        <summary>Asignar</summary>
        {patients.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={caregiver.patient_ids.includes(p.id)}
              disabled={assign.isPending}
              onChange={(e) => change(p.id, e.target.checked)}
            />{" "}
            {pFull(p)}
          </label>
        ))}
      </details>
    </td>
  );
}

type Errors = Partial<Record<"first" | "last" | "phone" | "email" | "birth" | "form", string>>;

export function AddCaregiverForm({ patients }: { patients: AdminPatient[] }) {
  const add = useAddCaregiver();
  const { toast } = useToast();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birth, setBirth] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = {
      first: first.trim(),
      last: last.trim(),
      phone: phone.trim(),
      email: email.trim(),
      birth: birth.trim(),
    };
    const birthIso = birthToIso(v.birth);
    const next: Errors = {};
    if (!v.first) next.first = "Falta el nombre.";
    if (!v.last) next.last = "Faltan los apellidos.";
    if (!okPhone(v.phone)) next.phone = "Revisá el teléfono.";
    if (!okMail(v.email)) next.email = "Revisá el mail.";
    if (!birthIso) next.birth = "Usá dd/mm/aaaa.";
    setErrors(next);
    if (Object.keys(next).length || !birthIso) return;
    try {
      await add.mutateAsync({
        first_name: v.first,
        last_names: v.last,
        phone: v.phone,
        email: v.email,
        birth_date: birthIso,
        patient_ids: ids,
      });
      setFirst("");
      setLast("");
      setPhone("");
      setEmail("");
      setBirth("");
      setIds([]);
      toast("Cuidador/a agregado. Le va a llegar un código por mail al ingresar.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") setErrors({ email: err.message });
      else setErrors({ form: errorMessage(err) });
    }
  }

  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Agregar cuidador/a
      </h2>
      <form className="form" onSubmit={submit} noValidate>
        <div className="two">
          <Field id="ac-nombre" label="Nombre" error={errors.first}>
            <input
              type="text"
              id="ac-nombre"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
          </Field>
          <Field id="ac-apellidos" label="Apellidos" error={errors.last}>
            <input
              type="text"
              id="ac-apellidos"
              value={last}
              onChange={(e) => setLast(e.target.value)}
            />
          </Field>
        </div>
        <div className="two">
          <Field
            id="ac-tel"
            label="Teléfono"
            hint="Con código de área, sin 0 ni 15."
            error={errors.phone}
          >
            <input
              type="text"
              id="ac-tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field id="ac-email" label="Mail" error={errors.email}>
            <input
              type="email"
              id="ac-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <Field id="ac-nac" label="Fecha de nacimiento" hint="dd/mm/aaaa" error={errors.birth}>
          <input
            type="text"
            id="ac-nac"
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
          />
        </Field>
        <div className="field">
          <span className="lbl">Pacientes que cuida</span>
          <div className="btn-row">
            {patients.map((p) => (
              <label className="check" style={{ padding: "10px 14px" }} key={p.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(p.id)}
                  onChange={(e) =>
                    setIds((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))
                  }
                />
                <span>{pFull(p)}</span>
              </label>
            ))}
          </div>
        </div>
        <p className="optional" style={{ margin: 0 }}>
          No lleva contraseña: al ingresar, le llega un código por mail.
        </p>
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

export function AdminCaregivers() {
  const caregivers = useAdminCaregivers();
  const patients = useAdminPatients();
  const admins = useAdminAdmins();
  return (
    <div className="page wide">
      <div className="head">
        <h1>Cuidadores</h1>
        <p className="sub">Datos de cada cuidador/a y a quién cuida.</p>
      </div>
      <Async query={patients}>
        {(pts) => (
          <>
            <Async query={caregivers}>
              {(list) => (
                <div className="card tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Apellidos</th>
                        <th>Teléfono</th>
                        <th>Mail</th>
                        <th>Nacimiento</th>
                        <th>Pacientes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.length === 0 && (
                        <tr>
                          <td colSpan={6} className="optional">
                            Todavía no hay cuidadores cargados.
                          </td>
                        </tr>
                      )}
                      {list.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <b style={{ color: "var(--ink)" }}>{c.first_name}</b>
                          </td>
                          <td>{c.last_names}</td>
                          <td className="n">{c.phone}</td>
                          <td>{c.email}</td>
                          <td className="n">{isoToBirth(c.birth_date)}</td>
                          <AssignCell caregiver={c} patients={pts} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Async>
            <AddCaregiverForm patients={pts} />
          </>
        )}
      </Async>
      <section className="group">
        <div className="row-between">
          <h2 className="section">Administradores</h2>
          <span className="pill neutral">Se cargan en la base de datos</span>
        </div>
        <Async query={admins}>
          {(list) => (
            <div className="card tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Apellido</th>
                    <th>Mail</th>
                    <th>Celular</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <b style={{ color: "var(--ink)" }}>{a.first_name}</b>
                      </td>
                      <td>{a.last_name}</td>
                      <td>{a.email}</td>
                      <td className="n">{a.mobile}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </section>
    </div>
  );
}
