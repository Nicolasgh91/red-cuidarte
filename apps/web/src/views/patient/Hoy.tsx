import { usePatientToday } from "../../api/queries/patient";
import { Async } from "../../components/common";
import { Icon } from "../../components/icons";
import { UrgentButton } from "../../components/Layer";
import { fmtLong, fromIso, hrsLabel, relDay } from "../../lib/dates";
import { quoteOfDay } from "../../lib/labels";

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
                        : "No hay turnos cargados."}
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
            <div className="quote">
              <div>
                <p>{quoteOfDay()}</p>
                <small>Frase del día · Red Cuidar</small>
              </div>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
