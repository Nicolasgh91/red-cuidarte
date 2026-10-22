import { Link } from "react-router";
import { useReminders } from "../../api/queries/reminders";
import type { ReminderSettings } from "../../api/types";
import { Icon } from "../../components/icons";
import type { IconName } from "../../components/icons";
import { useLayer } from "../../components/Layer";
import { gcalPause, listJoin } from "../../lib/dates";
import { freqLabel } from "../../lib/labels";
import { PAUSES } from "../../lib/pauses";

type Interval = ReminderSettings["water"];
const intervalSummary = (r: Interval): string =>
  r.on ? `${freqLabel(r.freq)}, de ${r.from} a ${r.to}` : "Apagado";
const relaxSummary = (r: ReminderSettings["relax"]): string => {
  const t = r.times.filter(Boolean).sort();
  return r.on && t.length ? `A las ${listJoin(t)}` : "Apagado";
};

function ReminderCard({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <Link className="card rem" to="/recordatorios">
      <span className="badge sq">
        <Icon name={icon} />
      </span>
      <div className="grow">
        <p className="card-title">{title}</p>
        <p className="card-text">{text}</p>
      </div>
      <span className="cfg">
        Configurar <Icon name="chevR" />
      </span>
    </Link>
  );
}

export function Pausa() {
  const { openPlayer } = useLayer();
  const { data: r, isPending } = useReminders();
  const fallback = isPending ? "Cargando…" : "No pudimos cargar tus recordatorios.";

  const cards = ["respirar", "escaneo", "estirar", "micro", "ritual"].map((k) => {
    const p = PAUSES[k]!;
    return (
      <button
        key={k}
        className="card guided"
        onClick={() => openPlayer(k)}
        aria-label={`Empezar ${p.title}`}
      >
        <span className="badge sq">
          <Icon name={p.icon} />
        </span>
        <div className="grow">
          <p className="card-title">{p.title}</p>
          <p className="card-text">{p.desc}</p>
          <span className="meta" style={{ marginTop: 6 }}>
            <Icon name="clock" /> {p.secs / 60} min
          </span>
        </div>
        <span className="play">
          <Icon name="play" />
        </span>
      </button>
    );
  });

  return (
    <div className="page">
      <div className="head">
        <h1>Descansar también es cuidarte</h1>
        <p className="sub">Elegí una pausa con el tiempo que tengas.</p>
      </div>
      <a className="outline-btn" href={gcalPause()} target="_blank" rel="noopener noreferrer">
        <Icon name="clock" /> Programar pausa en Google Calendar
      </a>
      <p className="help">
        Se abrirá un evento con una hora sugerida. Elegí la fecha, el horario y los avisos, y
        guardalo en Google Calendar. No se guarda automáticamente ni se sincroniza con Cuidarte+.
      </p>
      <section className="group">
        <h2 className="section">Recordatorios</h2>
        <div className="cards3">
          <ReminderCard
            icon="cup"
            title="1 minuto para hidratarte"
            text={r ? intervalSummary(r.water) : fallback}
          />
          <ReminderCard
            icon="walk"
            title="Estiramientos"
            text={r ? intervalSummary(r.stretch) : fallback}
          />
          <ReminderCard
            icon="leaf"
            title="5 minutos para relajarte"
            text={r ? relaxSummary(r.relax) : fallback}
          />
        </div>
      </section>
      <section className="group">
        <h2 className="section">Pausas guiadas</h2>
        <div className="cards2">{cards.slice(0, 4)}</div>
        {cards[4]}
      </section>
    </div>
  );
}
