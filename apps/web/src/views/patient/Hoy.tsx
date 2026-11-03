import { Link } from "react-router";
import { errorMessage } from "../../api/errors";
import { useLinkCode, usePatientToday, useRenewLinkCode } from "../../api/queries/patient";
import { Async } from "../../components/common";
import { useToast } from "../../components/Toasts";
import { Icon } from "../../components/icons";
import { UrgentButton } from "../../components/Layer";
import { fmtDateTime, fmtLong, fromIso, hrsLabel, relDay } from "../../lib/dates";
import { DISCLAIMER } from "../../lib/labels";

/** Código de un solo uso para que un cuidador/a se vincule con este paciente. */
function LinkCode() {
  const q = useLinkCode();
  const renew = useRenewLinkCode();
  const { toast } = useToast();
  const code = q.data?.code;
  return (
    <section className="group" aria-labelledby="link-title">
      <h2 className="section" id="link-title">
        Vincular a quien te cuida
      </h2>
      <div className="card pcard">
        <p style={{ margin: 0 }}>
          Compartí este código con tu cuidador/a para que pueda acompañarte en la app. Vale 48 horas
          y se usa una sola vez.
        </p>
        {code ? (
          <>
            <p
              className="tnum"
              style={{ fontSize: "1.8rem", letterSpacing: "0.12em", margin: "12px 0 0" }}
              aria-label={`Código ${code.split("").join(" ")}`}
            >
              {code.slice(0, 4)}-{code.slice(4)}
            </p>
            {q.data?.expires_at && (
              <p className="optional" style={{ margin: "4px 0 12px" }}>
                Vale hasta {fmtDateTime(q.data.expires_at)}.
              </p>
            )}
          </>
        ) : q.isError ? (
          <div role="alert">
            <p className="optional">{errorMessage(q.error)}</p>
            <button className="ghost" type="button" onClick={() => void q.refetch()}>
              Reintentar
            </button>
          </div>
        ) : (
          <p className="optional" role="status">
            Generando el código…
          </p>
        )}
        <p className="optional" style={{ margin: "0 0 8px" }}>
          Si generás uno nuevo, el anterior deja de funcionar.
        </p>
        <button
          className="ghost"
          type="button"
          disabled={renew.isPending}
          onClick={() =>
            renew.mutate(undefined, {
              onSuccess: () => toast("Código nuevo listo."),
              onError: (e) => toast(errorMessage(e)),
            })
          }
        >
          Generar un código nuevo
        </button>
      </div>
    </section>
  );
}

export function Hoy() {
  const q = usePatientToday();
  return (
    <Async query={q}>
      {(d) => {
        const cur = d.current;
        const nxt = d.next;
        return (
          <div className="page narrow">
            <div className="head">
              <p className="hello">Hola{d.patient ? `, ${d.patient.first_name}` : ""}</p>
              <h1>Tu día</h1>
              <p className="sub">{fmtLong(fromIso(d.date))}</p>
            </div>
            <UrgentButton />
            <section className="card rcard">
              <div className="rhead">
                <span className="badge">
                  <Icon name="users" />
                </span>
                <div>
                  <h3>{cur ? "Te está cuidando" : "Quién te cuida"}</h3>
                  <p>
                    {cur
                      ? `${cur.caregiver}, hasta las ${cur.end}`
                      : nxt
                        ? `${nxt.caregiver} · ${relDay(nxt.date)}, ${hrsLabel(nxt)}`
                        : "Todavía no hay turnos cargados. Cuando quien te cuida los cargue, los vas a ver acá. Si todavía no tenés a nadie vinculado, compartí el código de más abajo."}
                  </p>
                </div>
              </div>
              {d.today_shifts.length > 0 && (
                <div className="tasks">
                  {d.today_shifts.map((s) => (
                    <div className="task" key={`${s.start}-${s.caregiver}`}>
                      <span className="time" style={{ width: "auto" }}>
                        {hrsLabel(s)}
                      </span>
                      <span className="txt">{s.caregiver}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="group">
              <h2 className="section">Tu medicación de hoy</h2>
              <div className="card pcard">
                {d.doses.length ? (
                  <div className="tasks">
                    {d.doses.map((x) => (
                      <div className="task" key={`${x.time}-${x.name}`}>
                        <span className="time">{x.time}</span>
                        <span className="txt">
                          {x.name} {x.dose}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="optional" style={{ margin: 0 }}>
                    No hay medicación cargada.
                  </p>
                )}
              </div>
              <p className="foot-note" style={{ margin: 0 }}>
                Si algo no coincide con lo que te indicó tu médico, avisale a quien te cuida.
              </p>
            </section>
            <LinkCode />
            <p className="optional" style={{ margin: 0 }}>
              ¿Necesitás ayuda con la app? <Link to="/contacto">Contacto</Link>
            </p>
            <p className="disclaimer">{DISCLAIMER}</p>
          </div>
        );
      }}
    </Async>
  );
}
