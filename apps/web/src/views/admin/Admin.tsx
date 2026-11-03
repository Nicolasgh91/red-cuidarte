import { Link } from "react-router";
import { useMe } from "../../api/queries/me";
import { useAdminSummary } from "../../api/queries/admin";
import { Async } from "../../components/common";

export function Admin() {
  const me = useMe();
  const summary = useAdminSummary();
  const name = me.data?.profile?.first_name;

  return (
    <div className="page wide">
      <div className="head">
        <p className="hello">{name ? `Hola, ${name}` : "Hola"}</p>
        <h1>Panel</h1>
        <p className="sub">Cuidadores, personas cuidadas, passkeys y correos.</p>
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
              <Link className="card stat" to="/admin-correos">
                <b>{nb ? (nb.days === 0 ? "Hoy" : `${nb.days} d`) : "—"}</b>
                <span>{nb ? `Cumple ${nb.first_name}` : "Sin cumpleaños"}</span>
              </Link>
            </div>
          );
        }}
      </Async>
    </div>
  );
}
