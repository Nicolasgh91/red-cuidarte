import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { errorMessage } from "../../api/errors";
import { useMyPatients } from "../../api/queries/me";
import { useCreateShift, useDeleteShift, useShifts } from "../../api/queries/shifts";
import type { Patient, Shift } from "../../api/types";
import { Async, Field } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import {
  addDays,
  cap,
  durMin,
  fmtDM,
  fmtHours,
  gcalShift,
  hrsLabel,
  iso,
  monday,
  weekLabel,
} from "../../lib/dates";
import { WD } from "../../lib/labels";

const patientName = (patients: Patient[], id: string): string => {
  const p = patients.find((x) => x.id === id);
  return p ? `${p.first_name} ${p.last_name}`.trim() : "Paciente";
};

function ShiftRow({
  shift,
  patients,
  onDelete,
}: {
  shift: Shift;
  patients: Patient[];
  onDelete: (s: Shift) => void;
}) {
  const name = patientName(patients, shift.patient_id);
  return (
    <div className="shift">
      <span className="hrs">{hrsLabel(shift)}</span>
      <span className="who">{name}</span>
      {shift.source === "assistant" && <span className="pill neutral">Asistente</span>}
      <span className="acts">
        <a
          className="icon-btn"
          href={gcalShift(shift, name)}
          target="_blank"
          rel="noopener noreferrer"
          title="Agregar a Google Calendar"
          aria-label="Agregar a Google Calendar"
        >
          <Icon name="calendar" />
        </a>
        <button
          className="icon-btn"
          onClick={() => onDelete(shift)}
          title="Borrar turno"
          aria-label="Borrar turno"
        >
          <Icon name="trash" />
        </button>
      </span>
    </div>
  );
}

export function AddShiftForm({
  patients,
  defaultDate,
}: {
  patients: Patient[];
  defaultDate: string;
}) {
  const create = useCreateShift();
  const { toast } = useToast();
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("14:00");
  const [repeat, setRepeat] = useState<1 | 4 | 8>(1);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!patientId) return setErr("Primero necesitás un paciente asignado.");
    if (!date || !start || !end) return setErr("Completá fecha, desde y hasta.");
    if (start === end) return setErr("El turno no puede empezar y terminar a la misma hora.");
    setErr(null);
    try {
      const r = await create.mutateAsync({
        patient_id: patientId,
        date,
        start,
        end,
        repeat_weeks: repeat,
      });
      const n = r.shifts.length;
      toast(
        <>
          <Icon name="check" />{" "}
          <span>{n === 1 ? "Turno agregado." : `${n} turnos agregados.`}</span>
        </>,
      );
    } catch (error) {
      setErr(errorMessage(error));
    }
  }

  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Agregar turno
      </h2>
      <form className="form" onSubmit={submit} noValidate>
        <div className="four">
          <Field id="sh-p" label="Paciente">
            <select id="sh-p" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.first_name} ${p.last_name}`.trim()}
                </option>
              ))}
            </select>
          </Field>
          <Field id="sh-d" label="Fecha">
            <input type="date" id="sh-d" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="sh-s" label="Desde">
            <input type="time" id="sh-s" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field id="sh-e" label="Hasta">
            <input type="time" id="sh-e" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field id="sh-r" label="Repetir">
          <select
            id="sh-r"
            value={repeat}
            onChange={(e) => setRepeat(Number(e.target.value) as 1 | 4 | 8)}
          >
            <option value="1">Solo ese día</option>
            <option value="4">Cada semana, por 4 semanas</option>
            <option value="8">Cada semana, por 8 semanas</option>
          </select>
        </Field>
        {err && (
          <p className="err" id="sh-err" role="alert">
            {err}
          </p>
        )}
        <button className="primary-btn auto" type="submit" disabled={create.isPending}>
          <Icon name="plus" /> Agregar turno
        </button>
      </form>
    </section>
  );
}

export function Turnos() {
  const [weekOff, setWeekOff] = useState(0);
  const { toast, dismiss } = useToast();
  const patientsQ = useMyPatients();
  const remove = useDeleteShift();
  const restore = useCreateShift();

  const today = new Date();
  const mon = addDays(monday(today), weekOff * 7);
  const todayIso = iso(today);
  const shiftsQ = useShifts(iso(mon), iso(addDays(mon, 6)));
  const patients = patientsQ.data ?? [];
  const inWeek = (shiftsQ.data ?? []).filter(
    (s) => s.date >= iso(mon) && s.date <= iso(addDays(mon, 6)),
  );
  const total = inWeek.reduce((n, s) => n + durMin(s.start, s.end), 0);

  async function del(s: Shift) {
    try {
      await remove.mutateAsync(s.id);
    } catch (e) {
      toast(errorMessage(e));
      return;
    }
    let toastId = 0;
    toastId = toast(
      <>
        <span>Turno borrado.</span>{" "}
        <button
          onClick={async () => {
            dismiss(toastId);
            try {
              await restore.mutateAsync({
                patient_id: s.patient_id,
                date: s.date,
                start: s.start,
                end: s.end,
                repeat_weeks: 1,
              });
            } catch (e) {
              toast(errorMessage(e));
            }
          }}
        >
          Deshacer
        </button>
      </>,
      6000,
    );
  }

  const defaultDate = iso(addDays(mon, weekOff ? 0 : Math.max(0, (today.getDay() + 6) % 7)));

  return (
    <div className="page">
      <div className="head">
        <h1>Tus turnos</h1>
        <p className="sub">Cargalos acá o contáselos al asistente y se agregan solos.</p>
      </div>
      <div className="toolbar">
        <div className="week-nav">
          <button
            className="icon-btn"
            onClick={() => setWeekOff((w) => w - 1)}
            aria-label="Semana anterior"
          >
            <Icon name="chevL" />
          </button>
          <strong>{weekLabel(mon)}</strong>
          <button
            className="icon-btn"
            onClick={() => setWeekOff((w) => w + 1)}
            aria-label="Semana siguiente"
          >
            <Icon name="chevR" />
          </button>
          {weekOff !== 0 && (
            <button className="ghost" onClick={() => setWeekOff(0)}>
              Esta semana
            </button>
          )}
        </div>
        <span className="pill neutral tnum">{fmtHours(total)} esta semana</span>
      </div>
      <Async query={shiftsQ}>
        {() => (
          <div className="card week">
            {WD.map((_, i) => {
              const d = addDays(mon, i);
              const di = iso(d);
              const list = inWeek.filter((s) => s.date === di);
              return (
                <div className={`day${di === todayIso ? " today" : ""}`} key={di}>
                  <div className="dname">
                    {cap(d.toLocaleDateString("es-AR", { weekday: "long" }))}
                    <small>
                      {fmtDM(d)}
                      {di === todayIso ? " · hoy" : ""}
                    </small>
                  </div>
                  <div className="shifts">
                    {list.length ? (
                      list.map((s) => (
                        <ShiftRow key={s.id} shift={s} patients={patients} onDelete={del} />
                      ))
                    ) : (
                      <span className="empty-day">Libre</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Async>
      <div className="btn-row">
        <Link className="outline-btn sm" to="/asistente">
          <Icon name="sparkle" /> Contáselos al asistente
        </Link>
      </div>
      <Async query={patientsQ}>
        {(list) => (
          <AddShiftForm
            key={`${weekOff}-${list.length}`}
            patients={list}
            defaultDate={defaultDate}
          />
        )}
      </Async>
      <p className="foot-note">
        Cada turno tiene un botón para pasarlo a Google Calendar. Los turnos todavía no se
        sincronizan solos con tu calendario.
      </p>
    </div>
  );
}
