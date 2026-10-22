import { useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "../../api/errors";
import { useReminders, useSaveReminders } from "../../api/queries/reminders";
import type { IntervalReminder, ReminderSettings } from "../../api/types";
import { Async, BackLink, Field } from "../../components/common";
import { Icon } from "../../components/icons";
import type { IconName } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { toMin } from "../../lib/dates";
import { FREQS } from "../../lib/labels";
import { useNotifier } from "../../reminders";
import type { ReminderType } from "../../reminders";

function IntervalCard({
  id,
  icon,
  title,
  sub,
  label,
  value,
  onChange,
  invalid,
  onTest,
}: {
  id: "water" | "stretch";
  icon: IconName;
  title: string;
  sub: string;
  label: string;
  value: IntervalReminder;
  onChange: (v: IntervalReminder) => void;
  invalid: boolean;
  onTest: () => void;
}) {
  return (
    <div className="card rcard">
      <div className="rhead">
        <span className="badge">
          <Icon name={icon} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{sub}</p>
        </div>
      </div>
      <label className="check">
        <input
          type="checkbox"
          id={`${id}-on`}
          checked={value.on}
          onChange={(e) => onChange({ ...value, on: e.target.checked })}
        />
        <span>{label}</span>
      </label>
      {value.on && (
        <div className="form" id={`${id}-opts`}>
          <Field id={`${id}-freq`} label="Frecuencia">
            <select
              id={`${id}-freq`}
              value={value.freq}
              onChange={(e) =>
                onChange({ ...value, freq: Number(e.target.value) as IntervalReminder["freq"] })
              }
            >
              {FREQS.map((f) => (
                <option key={f[0]} value={f[0]}>
                  {f[1]}
                </option>
              ))}
            </select>
          </Field>
          <div className="two">
            <Field id={`${id}-from`} label="Desde">
              <input
                type="time"
                id={`${id}-from`}
                value={value.from}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
              />
            </Field>
            <Field id={`${id}-to`} label="Hasta">
              <input
                type="time"
                id={`${id}-to`}
                value={value.to}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
              />
            </Field>
          </div>
          {invalid && (
            <p className="err" id={`${id}-err`} role="alert">
              El horario «Hasta» tiene que ser posterior a «Desde».
            </p>
          )}
        </div>
      )}
      <button type="button" className="link-btn" onClick={onTest}>
        Probar este aviso
      </button>
    </div>
  );
}

function PermissionCard() {
  const supported = typeof Notification !== "undefined";
  const [perm, setPerm] = useState<string>(supported ? Notification.permission : "unsupported");
  const [msg, setMsg] = useState<string | null>(null);
  const { toast } = useToast();

  async function request() {
    try {
      if (!supported) throw new Error("unsupported");
      const res = await Notification.requestPermission();
      setPerm(res);
      if (res !== "granted") throw new Error("denied");
      toast("Notificaciones activadas.");
    } catch {
      setMsg(
        "Este navegador no dio permiso para notificaciones. Igual vas a ver los avisos dentro de la app mientras esté abierta.",
      );
    }
  }

  return (
    <div className="card perm">
      {perm === "granted" ? (
        <p>Las notificaciones del navegador están activadas.</p>
      ) : (
        <>
          <p>Para que los avisos lleguen como notificación, el navegador necesita tu permiso.</p>
          <button type="button" onClick={() => void request()}>
            Permitir notificaciones
          </button>
          {msg && (
            <p className="err" role="alert">
              {msg}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function RemindersForm({ initial }: { initial: ReminderSettings }) {
  const notify = useNotifier();
  const save = useSaveReminders();
  const { toast } = useToast();
  const [water, setWater] = useState(initial.water);
  const [stretch, setStretch] = useState(initial.stretch);
  const [relaxOn, setRelaxOn] = useState(initial.relax.on);
  const [times, setTimes] = useState<string[]>([0, 1, 2].map((i) => initial.relax.times[i] ?? ""));
  const [checked, setChecked] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);

  const bad = (r: IntervalReminder) => r.on && !((toMin(r.to) ?? 0) > (toMin(r.from) ?? 0));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setChecked(true);
    if (bad(water) || bad(stretch)) return;
    setServerErr(null);
    const norm = (r: IntervalReminder): IntervalReminder => ({
      ...r,
      from: r.from || "08:00",
      to: r.to || "20:00",
    });
    try {
      await save.mutateAsync({
        water: norm(water),
        stretch: norm(stretch),
        relax: { on: relaxOn, times: times.filter(Boolean).slice(0, 3) },
      });
      toast(
        <>
          <Icon name="check" /> <span>Recordatorios guardados.</span>
        </>,
      );
    } catch (err) {
      setServerErr(errorMessage(err));
    }
  }
  const test = (t: ReminderType) => () => notify(t);

  return (
    <form className="form" onSubmit={submit} noValidate>
      <IntervalCard
        id="water"
        icon="cup"
        title="1 minuto para hidratarte"
        sub="Un aviso para tomar agua."
        label="Recordarme hidratarme"
        value={water}
        onChange={setWater}
        invalid={checked && bad(water)}
        onTest={test("water")}
      />
      <IntervalCard
        id="stretch"
        icon="walk"
        title="Estiramientos"
        sub="Un aviso para mover cuello, hombros y espalda."
        label="Recordarme estirarme"
        value={stretch}
        onChange={setStretch}
        invalid={checked && bad(stretch)}
        onTest={test("stretch")}
      />
      <div className="card rcard">
        <div className="rhead">
          <span className="badge">
            <Icon name="leaf" />
          </span>
          <div>
            <h3>5 minutos para relajarte</h3>
            <p>Elegí los horarios que te queden mejor.</p>
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            id="relax-on"
            checked={relaxOn}
            onChange={(e) => setRelaxOn(e.target.checked)}
          />
          <span>Recordarme hacer una pausa</span>
        </label>
        {relaxOn && (
          <div className="form" id="relax-opts">
            <div className="three">
              {times.map((t, i) => (
                <Field key={i} id={`relax-t${i}`} label={`Horario ${i + 1}`}>
                  <input
                    type="time"
                    id={`relax-t${i}`}
                    value={t}
                    onChange={(e) =>
                      setTimes((l) => l.map((x, j) => (j === i ? e.target.value : x)))
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="optional" style={{ margin: 0, fontSize: ".86rem" }}>
              Dejá vacío el horario que no uses.
            </p>
          </div>
        )}
        <button type="button" className="link-btn" onClick={test("relax")}>
          Probar este aviso
        </button>
      </div>
      {serverErr && (
        <p className="err" role="alert">
          {serverErr}
        </p>
      )}
      <button className="primary-btn" type="submit" disabled={save.isPending}>
        Guardar recordatorios
      </button>
    </form>
  );
}

export function Recordatorios() {
  const q = useReminders();
  return (
    <div className="page narrow">
      <BackLink to="/pausa">Pausas</BackLink>
      <div className="head">
        <h1>Recordatorios</h1>
        <p className="sub">Avisos para hidratarte, estirarte y relajarte durante el día.</p>
      </div>
      <PermissionCard />
      <Async query={q}>{(data) => <RemindersForm initial={data} />}</Async>
      <p className="foot-note">
        En la web, los avisos aparecen solo mientras la app está abierta. En la app de Android
        llegan como notificación aunque esté cerrada. En iPhone, primero hay que agregar Cuidarte+ a
        la pantalla de inicio.
      </p>
    </div>
  );
}
