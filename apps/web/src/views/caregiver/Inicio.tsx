import { Link } from "react-router";
import { useMe, useMyPatients } from "../../api/queries/me";
import { useShifts } from "../../api/queries/shifts";
import { useTasks } from "../../api/queries/tasks";
import { Icon } from "../../components/icons";
import type { IconName } from "../../components/icons";
import { UrgentButton, useLayer } from "../../components/Layer";
import { absEnd, absStart, addDays, hrsLabel, iso, nowAbs, relDay } from "../../lib/dates";
import { DISCLAIMER, quoteOfDay } from "../../lib/labels";
import type { ReactNode } from "react";

function NavCard({
  to,
  icon,
  title,
  children,
}: {
  to: string;
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link className="card" to={to}>
      <span className="badge">
        <Icon name={icon} />
      </span>
      <div className="grow">
        <p className="card-title">{title}</p>
        {children}
      </div>
      <Icon name="chevR" className="i chev" />
    </Link>
  );
}

export function Inicio() {
  const { openPlayer } = useLayer();
  const me = useMe();
  const patients = useMyPatients();
  const now = new Date();
  const today = iso(now);
  const shifts = useShifts(today, iso(addDays(now, 60)));
  const tasks = useTasks(today);

  const name = me.data?.profile?.first_name;
  const next = shifts.data
    ?.filter((s) => absEnd(s) > nowAbs())
    .sort((a, b) => absStart(a) - absStart(b))[0];
  const patientName = (id: string) => {
    const p = patients.data?.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name}`.trim() : "Paciente";
  };
  const groups = tasks.data?.patients ?? [];
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const ok = groups.reduce((n, g) => n + g.tasks.filter((t) => t.done).length, 0);

  const shiftText = shifts.isPending
    ? "Cargando…"
    : shifts.isError
      ? "No pudimos cargar tus turnos."
      : next
        ? `${relDay(next.date)}, ${hrsLabel(next)} · ${patientName(next.patient_id)}`
        : "No tenés turnos cargados. Contáselos al asistente.";
  const taskText = tasks.isPending
    ? "Cargando…"
    : tasks.isError
      ? "No pudimos cargar tus tareas."
      : total
        ? `${ok} de ${total} hechas`
        : "Sin tareas para hoy.";

  return (
    <div className="page wide">
      <div className="head">
        <p className="hello">{name ? `Hola, ${name}` : "Hola"}</p>
        <h1 className="home-h1">Tu momento especial para vos...!!!</h1>
        <p className="lead-up">Comencemos hoy para ser tu mejor versión.</p>
      </div>
      <div className="group">
        <div className="tiles">
          <Link className="tile t-blue" to="/bienestar">
            <Icon name="sun" /> Registrar cómo estoy...
          </Link>
          <Link className="tile t-green" to="/pausa">
            <Icon name="pause" /> Hacer una pausa
          </Link>
          <button className="tile t-yellow" onClick={() => openPlayer("escaneo")}>
            <Icon name="user" /> Escaneo corporal
          </button>
          <button className="tile t-orange" onClick={() => openPlayer("ritual")}>
            <Icon name="moon" /> Ritual fin de la jornada
          </button>
        </div>
        <UrgentButton />
      </div>
      <div className="group">
        <h2 className="serif">Tu día</h2>
        <div className="cards2">
          <NavCard to="/turnos" icon="calendar" title="Próximo turno">
            <p className="card-text">{shiftText}</p>
          </NavCard>
          <NavCard to="/tareas" icon="list" title="Tareas de hoy">
            <p className="card-text tnum">{taskText}</p>
            {total > 0 && (
              <div className="mini-bar">
                <i style={{ width: `${Math.round((ok / total) * 100)}%` }} />
              </div>
            )}
          </NavCard>
        </div>
      </div>
      <div className="group">
        <h2 className="serif">Para acompañarte</h2>
        <div className="cards2">
          <NavCard to="/recursos" icon="book" title="Cuidarte mientras cuidás">
            <p className="card-text">Estrés, descanso, autocuidado y técnicas para el día a día.</p>
          </NavCard>
          <NavCard to="/asistente" icon="sparkle" title="Asistente">
            <p className="card-text">Preguntale lo que necesites o contale tus turnos.</p>
          </NavCard>
        </div>
      </div>
      <div className="quote">
        <svg width="108" height="44" viewBox="0 0 108 44" aria-hidden="true">
          <path d="M0 44V30C18 10 34 8 52 22s34 6 56-14v36z" fill="var(--wave-a)" />
          <path d="M0 44V36c22-10 40-12 58-4s32 2 50-8v20z" fill="var(--wave-b)" />
        </svg>
        <div>
          <p>{quoteOfDay()}</p>
          <small>
            Frase del día · <Link to="/acerca">Red Cuidar</Link>
          </small>
        </div>
      </div>
      <p className="disclaimer">{DISCLAIMER}</p>
    </div>
  );
}
