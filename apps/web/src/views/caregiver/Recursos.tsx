import { Link } from "react-router";
import { ARTICLES, CATS } from "../../content";
import { Icon } from "../../components/icons";
import type { IconName } from "../../components/icons";

export function Recursos() {
  return (
    <div className="page">
      <div className="head">
        <h1>Cuidarte mientras cuidás</h1>
        <p className="sub">Recursos para acompañar tu tarea cotidiana.</p>
      </div>
      {CATS.map((c) => (
        <section className="group" key={c}>
          <h2 className="section">{c}</h2>
          {ARTICLES.filter((a) => a.cat === c).map((a) => (
            <Link className="card res" to={`/recursos/${a.id}`} key={a.id}>
              <span className="badge sq">
                <Icon name={a.icon as IconName} />
              </span>
              <div className="grow">
                <p className="card-title">{a.title}</p>
                <p className="card-text">{a.desc}</p>
                <span className="meta">
                  <Icon name="clock" /> 1 min de lectura
                </span>
              </div>
              <Icon name="chevR" className="i chev" />
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
