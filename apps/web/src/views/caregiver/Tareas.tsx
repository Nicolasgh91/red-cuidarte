import { useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "../../api/errors";
import {
  useAddTemplate,
  useRemoveTemplate,
  useTasks,
  useToggleTask,
} from "../../api/queries/tasks";
import type { TaskGroup } from "../../api/types";
import { Async, EmptyCard } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { addDays, fmtDM, fmtLong, iso, relDay } from "../../lib/dates";

function PatientTasks({ group, date }: { group: TaskGroup; date: string }) {
  const toggle = useToggleTask(date);
  const add = useAddTemplate();
  const remove = useRemoveTemplate();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const pid = group.patient.id;
  const name = `${group.patient.first_name} ${group.patient.last_name}`.trim();
  const list = group.tasks;
  const ok = list.filter((t) => t.done).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    try {
      await add.mutateAsync({ patient_id: pid, text: t, ...(time ? { time } : {}) });
      setText("");
      setTime("");
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  return (
    <section className="card pcard">
      <div className="row-between">
        <div>
          <h2 className="section" style={{ fontSize: "1.25rem" }}>
            {name}
          </h2>
        </div>
        <span className={`pill ${ok === list.length && list.length ? "ok" : "neutral"} tnum`}>
          {ok} de {list.length}
        </span>
      </div>
      <div className="mini-bar" style={{ margin: 0 }}>
        <i style={{ width: `${list.length ? Math.round((ok / list.length) * 100) : 0}%` }} />
      </div>
      <div className="tasks">
        {list.map((t) => (
          <label className={`task${t.done ? " done" : ""}`} key={t.key}>
            <input
              type="checkbox"
              checked={t.done}
              onChange={(e) =>
                toggle.mutate(
                  { patient_id: pid, task_key: t.key, done: e.target.checked },
                  { onError: (err) => toast(errorMessage(err)) },
                )
              }
            />
            <span className="time">{t.time || "—"}</span>
            <span className="txt">{t.text}</span>
            {t.med ? (
              <span className="pill warn">
                <Icon name="pill" style={{ width: 13, height: 13 }} /> Medicación
              </span>
            ) : (
              <button
                type="button"
                className="icon-btn"
                aria-label="Quitar tarea diaria"
                onClick={(e) => {
                  e.preventDefault();
                  remove.mutate(t.key, { onError: (err) => toast(errorMessage(err)) });
                }}
              >
                <Icon name="x" />
              </button>
            )}
          </label>
        ))}
      </div>
      <form className="btn-row" onSubmit={submit} noValidate>
        <input
          type="text"
          placeholder="Nueva tarea diaria"
          aria-label={`Nueva tarea diaria para ${name}`}
          style={{ flex: 1, minWidth: 180 }}
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          type="time"
          aria-label="Horario"
          style={{ width: 130 }}
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
        <button className="ghost" type="submit" disabled={add.isPending}>
          <Icon name="plus" /> Agregar
        </button>
      </form>
    </section>
  );
}

export function Tareas() {
  const [dayOff, setDayOff] = useState(0);
  const d = addDays(new Date(), dayOff);
  const di = iso(d);
  const q = useTasks(di);

  return (
    <div className="page narrow">
      <div className="head">
        <h1>Tareas del día</h1>
        <p className="sub">
          Un checklist por cada persona que cuidás. Se arma solo todos los días.
        </p>
      </div>
      <div className="toolbar">
        <div className="week-nav">
          <button
            className="icon-btn"
            onClick={() => setDayOff((x) => x - 1)}
            aria-label="Día anterior"
          >
            <Icon name="chevL" />
          </button>
          <strong>{relDay(di) === "Hoy" ? `Hoy, ${fmtDM(d)}` : fmtLong(d)}</strong>
          <button
            className="icon-btn"
            onClick={() => setDayOff((x) => x + 1)}
            aria-label="Día siguiente"
          >
            <Icon name="chevR" />
          </button>
          {dayOff !== 0 && (
            <button className="ghost" onClick={() => setDayOff(0)}>
              Hoy
            </button>
          )}
        </div>
      </div>
      <Async query={q}>
        {(data) =>
          data.patients.length ? (
            <>
              {data.patients.map((g) => (
                <PatientTasks key={g.patient.id} group={g} date={di} />
              ))}
            </>
          ) : (
            <EmptyCard>
              Todavía no tenés pacientes asignados. Pedile al administrador que te los asigne.
            </EmptyCard>
          )
        }
      </Async>
      <p className="foot-note">
        Las tareas de medicación salen de la ficha de cada paciente que carga el administrador. Las
        demás las podés agregar o quitar vos.
      </p>
    </div>
  );
}
