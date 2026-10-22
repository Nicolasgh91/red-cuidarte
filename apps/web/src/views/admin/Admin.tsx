import { Link } from "react-router";
import { useMe } from "../../api/queries/me";
import { useAdminDevices, useAdminSummary } from "../../api/queries/admin";
import { Async } from "../../components/common";
import { ago } from "../../lib/dates";

export function Admin() {
  const me = useMe();
  const summary = useAdminSummary();
  const devices = useAdminDevices();
  const name = me.data?.profile?.first_name;

  return (
    <div className="page wide">
      <div className="head">
        <p className="hello">{name ? `Hola, ${name}` : "Hola"}</p>
        <h1>Panel</h1>
        <p className="sub">Cuidadores, personas cuidadas, dispositivos y correos.</p>
      </div>
      <Async query={summary}>
        {(s) => {
          const nb = s.next_birthday;
          return (
            <div className="stats">
              <Link className="card stat" to="/admin-cuidadores">
                <b>{s.caregivers}</b>
                <span>Cuidadores</span>
              </Link>
              <Link className="card stat" to="/admin-pacientes">
                <b>{s.patients}</b>
                <span>Personas cuidadas</span>
              </Link>
              <div className="card stat">
                <b>{s.shifts_this_week}</b>
                <span>Turnos esta semana</span>
              </div>
              <Link className="card stat" to="/admin-dispositivos">
                <b>{s.blocked_attempts}</b>
                <span>Accesos bloqueados</span>
              </Link>
              <Link className="card stat" to="/admin-correos">
                <b>{nb ? (nb.days === 0 ? "Hoy" : `${nb.days} d`) : "—"}</b>
                <span>{nb ? `Cumple ${nb.first_name}` : "Sin cumpleaños"}</span>
              </Link>
            </div>
          );
        }}
      </Async>
      <section className="group">
        <h2 className="section">Requiere atención</h2>
        <Async query={devices}>
          {(list) => (
            <>
              {list
                .filter((d) => d.blocked)
                .map((d) => (
                  <div className="card rcard" style={{ gap: 10 }} key={d.id}>
                    <div className="row-between">
                      <div>
                        <b style={{ color: "var(--ink)" }}>{d.name}</b> intentó entrar desde otro
                        dispositivo
                      </div>
                      <span className="pill bad">Bloqueado</span>
                    </div>
                    <p className="optional" style={{ margin: 0 }}>
                      {d.blocked?.label} · IP {d.blocked?.ip ?? "—"} ·{" "}
                      {d.blocked ? ago(d.blocked.at) : ""}
                    </p>
                    <div className="btn-row">
                      <Link className="ghost" to="/admin-dispositivos">
                        Revisar
                      </Link>
                    </div>
                  </div>
                ))}
            </>
          )}
        </Async>
        <div className="card rcard" style={{ gap: 10 }}>
          <div className="row-between">
            <b style={{ color: "var(--ink)" }}>Casilla de correo en DonWeb</b>
            <span className="pill warn">Pendiente</span>
          </div>
          <p className="optional" style={{ margin: 0 }}>
            Hace falta para mandar los saludos de cumpleaños. Se configura fuera de la app.
          </p>
          <div className="btn-row">
            <Link className="ghost" to="/admin-correos">
              Ver pasos
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
