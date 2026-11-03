import {
  useAddMedication,
  useAddPatient,
  useAdminCaregivers,
  useAdminPatients,
  useRemoveMedication,
} from "../../api/queries/admin";
import type { AdminCaregiver, AdminPatient } from "../../api/types";
import { AddPatientForm } from "../../components/AddPatientForm";
import { Medications } from "../../components/Medications";
import { Async } from "../../components/common";
import { personName } from "../../api/types";

function PatientCard({
  patient,
  caregivers,
}: {
  patient: AdminPatient;
  caregivers: AdminCaregiver[];
}) {
  const addMed = useAddMedication();
  const removeMed = useRemoveMedication();
  const cgs = patient.caregiver_ids
    .map((id) => caregivers.find((c) => c.id === id))
    .filter((c): c is AdminCaregiver => !!c)
    .map(personName);

  return (
    <section className="card pcard">
      <div className="row-between">
        <h2 className="section" style={{ fontSize: "1.25rem" }}>
          {personName(patient)}
        </h2>
        <span className="optional">
          {cgs.length ? `Cuidan: ${cgs.join(", ")}` : "Sin cuidadores asignados"}
        </span>
      </div>
      <Medications
        patientId={patient.id}
        medications={patient.medications}
        add={addMed}
        remove={removeMed}
      />
    </section>
  );
}

export function AdminPacientes() {
  const addPatient = useAddPatient();
  const patients = useAdminPatients();
  const caregivers = useAdminCaregivers();
  return (
    <div className="page">
      <div className="head">
        <h1>Pacientes</h1>
        <p className="sub">Nombre, apellido y medicación.</p>
      </div>
      <p className="note">
        La medicación es un dato de salud: la ven el administrador, los cuidadores asignados y el
        propio paciente. Cada toma aparece como tarea en el checklist diario del cuidador.
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
      <AddPatientForm mutation={addPatient} />
    </div>
  );
}
