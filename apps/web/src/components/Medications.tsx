import { useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "../api/errors";
import { parseTimes } from "../lib/dates";
import { Field } from "./common";
import { Icon } from "./icons";
import { useToast } from "./Toasts";

export interface MedicationItem {
  id: string;
  name: string;
  dose: string;
  times: string[];
}

export interface AddMedicationInput {
  patientId: string;
  name: string;
  dose: string;
  times: string[];
}

/** Lo mínimo que necesita el componente de una mutación de TanStack Query. */
export interface MedicationMutations {
  add: { mutateAsync(v: AddMedicationInput): Promise<unknown>; isPending: boolean };
  remove: { mutate(id: string, o: { onError: (e: unknown) => void }): void };
}

function MedicationForm({
  patientId,
  add,
}: {
  patientId: string;
  add: MedicationMutations["add"];
}) {
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

/** Medicación de una persona cuidada: tabla con quitar y formulario para agregar. */
export function Medications({
  patientId,
  medications,
  add,
  remove,
}: {
  patientId: string;
  medications: MedicationItem[];
} & MedicationMutations) {
  const { toast } = useToast();
  return (
    <>
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
            {medications.length ? (
              medications.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.dose}</td>
                  <td className="n">{m.times.join(", ")}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="icon-btn"
                      aria-label={`Quitar ${m.name}`}
                      onClick={() =>
                        remove.mutate(m.id, { onError: (e) => toast(errorMessage(e)) })
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
      <MedicationForm patientId={patientId} add={add} />
    </>
  );
}
