import { useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "../../api/errors";
import {
  useAddMyMedication,
  useAddMyPatient,
  useLinkPatient,
  useMyPatients,
  useRemoveMyMedication,
} from "../../api/queries/me";
import { AddPatientForm } from "../../components/AddPatientForm";
import { Async, EmptyCard, Field } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { Medications } from "../../components/Medications";
import { personName } from "../../api/types";

/** Una persona que ya se registró le pasa su código y queda vinculada. */
function LinkForm() {
  const link = useLinkPatient();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError("Escribí el código.");
    setError(null);
    try {
      await link.mutateAsync(code.trim());
      setCode("");
      toast("Listo, ya la acompañás.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Vincular a alguien que ya tiene cuenta
      </h2>
      <form className="form" onSubmit={submit} noValidate>
        <Field
          id="link-code"
          label="Código"
          hint="La persona lo ve en su pantalla «Tu día», en «Vincular a quien te cuida»."
          error={error ?? undefined}
        >
          <input
            type="text"
            id="link-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <button className="primary-btn auto" type="submit" disabled={link.isPending}>
          <Icon name="plus" /> Vincular
        </button>
      </form>
    </section>
  );
}

/** Las personas que cuida: las que le asigna el admin y las que da de alta ella misma. */
export function Pacientes() {
  const patients = useMyPatients();
  const addPatient = useAddMyPatient();
  const addMed = useAddMyMedication();
  const removeMed = useRemoveMyMedication();
  return (
    <div className="page">
      <div className="head">
        <h1>Personas cuidadas</h1>
        <p className="sub">
          Quienes acompañás. Sumá a alguien nuevo o vinculá a quien ya tiene cuenta con su código.
        </p>
      </div>
      <Async query={patients}>
        {(list) =>
          list.length ? (
            list.map((p) => (
              <section className="card pcard" key={p.id}>
                <h2 className="section" style={{ fontSize: "1.25rem" }}>
                  {personName(p)}
                </h2>
                <Medications
                  patientId={p.id}
                  medications={p.medications}
                  add={addMed}
                  remove={removeMed}
                />
              </section>
            ))
          ) : (
            <EmptyCard>
              Todavía no tenés personas cuidadas. Agregá a la primera acá abajo.
            </EmptyCard>
          )
        }
      </Async>
      <LinkForm />
      <AddPatientForm mutation={addPatient} />
    </div>
  );
}
