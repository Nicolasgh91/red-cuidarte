import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import {
  useSaveWellbeing,
  useWellbeingDaily,
  useWellbeingWeekly,
} from "../../api/queries/wellbeing";
import { errorMessage } from "../../api/errors";
import type { WeeklyRow, WellbeingRecord } from "../../api/types";
import { Async, EmptyCard } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { addDays, fmtLong, fromIso, iso, weekLabel } from "../../lib/dates";
import { ENERGY, MOODS, STRESS, WD, indexToLabel, labelToIndex } from "../../lib/labels";
import type { Scale } from "../../lib/labels";

interface Draft {
  mood: string | null;
  energy: string | null;
  stress: string | null;
}
const EMPTY: Draft = { mood: null, energy: null, stress: null };

function Seg({
  name,
  label,
  options,
  value,
  onPick,
}: {
  name: string;
  label: string;
  options: Scale;
  value: string | null;
  onPick: (v: string) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label} data-name={name}>
      {options.map((o) => (
        <button type="button" key={o} aria-pressed={value === o} onClick={() => onPick(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function DailyRecords({ records }: { records: WellbeingRecord[] }) {
  return (
    <div className="records">
      {records.map((r) => (
        <div className="card record" key={r.id}>
          <b>{fmtLong(new Date(r.at))}</b>
          <span className="vals">
            Ánimo: {indexToLabel(MOODS, r.mood)} · Energía: {indexToLabel(ENERGY, r.energy)} ·
            Estrés: {indexToLabel(STRESS, r.stress)}
          </span>
          {r.note && <q>{r.note}</q>}
        </div>
      ))}
    </div>
  );
}

function Meter({ label, v, opts, inv }: { label: string; v: number; opts: Scale; inv?: boolean }) {
  return (
    <div className="meter">
      <span>
        {label}: <b>{indexToLabel(opts, v)}</b>
      </span>
      <div className={`track${inv ? " inv" : ""}`}>
        <i style={{ width: `${Math.round(((v + 1) / 5) * 100)}%` }} />
      </div>
    </div>
  );
}

export function WeeklyRecords({ weeks }: { weeks: WeeklyRow[] }) {
  return (
    <div className="records">
      {weeks.map((w) => {
        const mon = fromIso(w.week_start);
        return (
          <div className="card weekcard" key={w.week_start}>
            <div className="row-between">
              <b style={{ color: "var(--ink)" }}>{weekLabel(mon)}</b>
              <span className="pill neutral tnum">
                {w.count} {w.count === 1 ? "registro" : "registros"}
              </span>
            </div>
            <div className="meters">
              <Meter label="Ánimo" v={w.avg_mood} opts={MOODS} />
              <Meter label="Energía" v={w.avg_energy} opts={ENERGY} />
              <Meter label="Estrés" v={w.avg_stress} opts={STRESS} inv />
            </div>
            <div className="dots" aria-label="Ánimo por día">
              {WD.map((wd, i) => {
                const m = w.mood_by_day[iso(addDays(mon, i))];
                const has = m != null && m >= 0;
                return (
                  <div className="dot" key={wd}>
                    <i
                      className={has ? `m${m}` : ""}
                      title={has ? indexToLabel(MOODS, m) : "Sin registro"}
                    />
                    {wd}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="foot-note" style={{ margin: 0 }}>
        Los puntos muestran el ánimo de cada día: del más bajo (rojo) al mejor (verde oscuro). Vacío
        = sin registro.
      </p>
    </div>
  );
}

function History() {
  const [mode, setMode] = useState<"dia" | "semana">("dia");
  const daily = useWellbeingDaily();
  const weekly = useWellbeingWeekly();
  const empty = (
    <EmptyCard>Todavía no hay registros. Elegí cómo estás y tocá «Guardar registro».</EmptyCard>
  );
  return (
    <section className="group">
      <div className="row-between">
        <h2 className="section">Tu historial</h2>
        <div className="toggle" role="group" aria-label="Vista del historial">
          <button type="button" aria-pressed={mode === "dia"} onClick={() => setMode("dia")}>
            Diario
          </button>
          <button type="button" aria-pressed={mode === "semana"} onClick={() => setMode("semana")}>
            Semanal
          </button>
        </div>
      </div>
      {mode === "dia" ? (
        <Async query={daily}>
          {(records) => (records.length ? <DailyRecords records={records} /> : empty)}
        </Async>
      ) : (
        <Async query={weekly}>
          {(weeks) => (weeks.length ? <WeeklyRecords weeks={weeks} /> : empty)}
        </Async>
      )}
    </section>
  );
}

export function Bienestar() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [note, setNote] = useState("");
  const [showErr, setShowErr] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const save = useSaveWellbeing();
  const { toast } = useToast();

  const complete = !!(draft.mood && draft.energy && draft.stress);
  const pick = (k: keyof Draft) => (v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setShowErr(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!complete) return setShowErr(true);
    setServerErr(null);
    try {
      await save.mutateAsync({
        mood: labelToIndex(MOODS, draft.mood),
        energy: labelToIndex(ENERGY, draft.energy),
        stress: labelToIndex(STRESS, draft.stress),
        note: note.trim(),
      });
      setDraft(EMPTY);
      setNote("");
      toast(
        <>
          <Icon name="check" /> <span>Registro guardado.</span>
        </>,
      );
    } catch (err) {
      setServerErr(errorMessage(err));
    }
  }

  return (
    <div className="page narrow">
      <div className="head">
        <h1>¿Cómo estás hoy?</h1>
        <p className="sub">No hay una respuesta correcta.</p>
      </div>
      <div className="privacy">
        <Icon name="lock" />
        <p>
          Lo que registrás acá lo ves solo vos: ni el administrador ni el asistente pueden verlo.{" "}
          <Link to="/terminos">Más sobre privacidad</Link>
        </p>
      </div>
      <form className="form" onSubmit={submit} noValidate>
        <div className="group">
          <h2 className="section">Estado emocional</h2>
          <Seg
            name="mood"
            label="Estado emocional"
            options={MOODS}
            value={draft.mood}
            onPick={pick("mood")}
          />
        </div>
        <div className="group">
          <h2 className="section">Energía</h2>
          <Seg
            name="energy"
            label="Energía"
            options={ENERGY}
            value={draft.energy}
            onPick={pick("energy")}
          />
        </div>
        <div className="group">
          <h2 className="section">Nivel de estrés</h2>
          <Seg
            name="stress"
            label="Nivel de estrés"
            options={STRESS}
            value={draft.stress}
            onPick={pick("stress")}
          />
        </div>
        <div className="group">
          <div className="row-between">
            <label
              htmlFor="reg-note"
              style={{ fontSize: "1.4rem", fontWeight: 500, color: "var(--ink)" }}
            >
              ¿Querés anotar algo?
            </label>
            <span className="optional">Opcional</span>
          </div>
          <textarea
            id="reg-note"
            maxLength={500}
            placeholder="Algo que quieras recordar de hoy..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {showErr && (
          <p className="err" role="alert">
            Elegí una opción en estado emocional, energía y estrés para guardar.
          </p>
        )}
        {serverErr && (
          <p className="err" role="alert">
            {serverErr}
          </p>
        )}
        <button className="primary-btn" type="submit" disabled={save.isPending}>
          <Icon name="check" /> Guardar registro
        </button>
      </form>
      <History />
    </div>
  );
}
