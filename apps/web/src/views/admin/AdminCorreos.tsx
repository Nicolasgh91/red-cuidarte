import { useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "../../api/errors";
import { useAdminCaregivers, useMailLog, useSendTestMail } from "../../api/queries/admin";
import { useMe } from "../../api/queries/me";
import type { MailLogRow } from "../../api/types";
import { Async } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { fmtDM, nextBirthday } from "../../lib/dates";
import { MSG, okMail } from "../../lib/validators";

const STEPS = [
  "Crear la casilla de envío en el panel de DonWeb (por ejemplo avisos@ con el dominio de la app).",
  "Cargar los datos SMTP que da DonWeb (servidor, puerto, usuario y contraseña) como variables de entorno del backend.",
  "Configurar SPF, DKIM y DMARC en el DNS del dominio para que los mails no caigan en spam.",
  "Mandar un mail de prueba y revisar que llegue a la bandeja de entrada.",
];

const KIND: Record<string, string> = { birthday: "Cumpleaños", test: "Prueba" };
const STATUS: Record<string, { cls: string; label: string }> = {
  sent: { cls: "ok", label: "Enviado" },
  failed: { cls: "bad", label: "Falló" },
  pending: { cls: "warn", label: "En curso" },
};

function LogTable({ log }: { log: MailLogRow[] }) {
  if (!log.length) return <p className="optional">Todavía no se mandó ningún mail.</p>;
  return (
    <div className="card tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Para</th>
            <th>Asunto</th>
            <th>Tipo</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {log.map((l) => {
            const st = STATUS[l.status] ?? { cls: "neutral", label: l.status };
            return (
              <tr key={l.id}>
                <td className="n">
                  {new Date(l.sent_at).toLocaleString("es-AR", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td>{l.to_email}</td>
                <td>{l.subject}</td>
                <td>{KIND[l.kind] ?? l.kind}</td>
                <td>
                  <span className={`pill ${st.cls}`} title={l.error ?? undefined}>
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TestMail() {
  const me = useMe();
  const send = useSendTestMail();
  const { toast } = useToast();
  const [to, setTo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const value = to ?? me.data?.profile?.email ?? "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const addr = value.trim();
    if (!okMail(addr)) return setErr(MSG.mail);
    setErr(null);
    try {
      const r = await send.mutateAsync(addr);
      toast(
        r.status === "sent"
          ? `Mail de prueba enviado a ${addr}.`
          : "No se pudo enviar el mail de prueba. Revisá la configuración del correo.",
        6000,
      );
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="mt-to">Enviar mail de prueba a</label>
        <input
          type="email"
          id="mt-to"
          value={value}
          onChange={(e) => setTo(e.target.value)}
          autoComplete="email"
        />
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
      </div>
      <div className="btn-row">
        <button className="ghost" type="submit" disabled={send.isPending}>
          <Icon name="mail" /> {send.isPending ? "Enviando…" : "Enviar mail de prueba"}
        </button>
      </div>
    </form>
  );
}

export function AdminCorreos() {
  const caregivers = useAdminCaregivers();
  const log = useMailLog();
  return (
    <div className="page">
      <div className="head">
        <h1>Correos</h1>
        <p className="sub">Saludos automáticos de cumpleaños para cada cuidador/a.</p>
      </div>
      <section className="card rcard">
        <div className="row-between">
          <h2 className="section" style={{ fontSize: "1.2rem" }}>
            Casilla de envío en DonWeb
          </h2>
          <span className="pill warn">Pendiente</span>
        </div>
        <ol className="checklist">
          {STEPS.map((s, i) => (
            <li key={i}>
              <span>
                <b style={{ color: "var(--ink)" }}>{i + 1}.</b> {s}
              </span>
            </li>
          ))}
        </ol>
        <p className="optional" style={{ margin: 0 }}>
          Se configura en DonWeb y en el servidor. Cuando esté lista, usá «Enviar mail de prueba»
          para comprobar que funciona.
        </p>
      </section>
      <section className="group">
        <h2 className="section">Próximos cumpleaños</h2>
        <Async query={caregivers}>
          {(list) => {
            const bd = list
              .map((c) => ({ c, nb: nextBirthday(c.birth_date) }))
              .filter((x): x is { c: typeof x.c; nb: NonNullable<typeof x.nb> } => !!x.nb)
              .sort((x, y) => x.nb.days - y.nb.days);
            const first = bd[0]?.c;
            return (
              <>
                <div className="card tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Cuidador/a</th>
                        <th>Mail</th>
                        <th>Cumple</th>
                        <th>Falta</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bd.map(({ c, nb }) => (
                        <tr key={c.id}>
                          <td>
                            <b style={{ color: "var(--ink)" }}>
                              {`${c.first_name} ${c.last_names}`.trim()}
                            </b>
                          </td>
                          <td>{c.email}</td>
                          <td className="n">
                            {fmtDM(nb.date)} · {nb.age} años
                          </td>
                          <td className="n">{nb.days === 0 ? "Hoy" : `${nb.days} días`}</td>
                          <td>
                            {nb.days === 0 ? (
                              <span className="pill ok">Se envía hoy 09:00</span>
                            ) : (
                              <span className="pill neutral">Programado</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="foot-note" style={{ margin: 0 }}>
                  El servidor revisa todos los días a las 09:00 quién cumple años y le manda el
                  saludo. Si el mail falla, queda registrado y se puede reintentar.
                </p>
                {first && (
                  <>
                    <h2 className="section">Así llega el mail</h2>
                    <div className="card mailprev">
                      <span className="optional">Para: {first.email}</span>
                      <span className="subj">¡Feliz cumpleaños, {first.first_name}!</span>
                      <p style={{ margin: 0 }}>
                        Hoy queremos cuidarte a vos. Gracias por todo lo que hacés por las personas
                        que acompañás. Regalate un momento: en Cuidarte+ tenés una pausa guiada
                        esperándote.
                      </p>
                      <p style={{ margin: 0, color: "var(--muted)" }}>
                        Red Cuidar · Cuidamos a quien cuida
                      </p>
                    </div>
                  </>
                )}
              </>
            );
          }}
        </Async>
        <TestMail />
        <h2 className="section">Historial de envíos</h2>
        <Async query={log}>{(rows) => <LogTable log={rows} />}</Async>
      </section>
    </div>
  );
}
