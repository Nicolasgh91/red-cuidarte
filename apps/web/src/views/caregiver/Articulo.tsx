import { Navigate, useParams } from "react-router";
import { BackLink } from "../../components/common";
import { Icon } from "../../components/icons";
import type { IconName } from "../../components/icons";
import { ARTICLES } from "../../content";

export function Articulo() {
  const { id } = useParams();
  const a = ARTICLES.find((x) => x.id === id);
  if (!a) return <Navigate to="/recursos" replace />;
  return (
    <div className="page narrow">
      <BackLink to="/recursos">Recursos</BackLink>
      <div className="head">
        <span className="tag">
          <Icon name={a.icon as IconName} style={{ width: 16, height: 16 }} /> {a.cat}
        </span>
        <h1>{a.title}</h1>
        <p className="sub">{a.desc}</p>
      </div>
      <article className="article">
        {a.body.map((b, i) =>
          b[0] === "p" ? (
            <p key={i}>{b[1]}</p>
          ) : b[0] === "h" ? (
            <h3 key={i}>{b[1]}</h3>
          ) : (
            <ul key={i}>
              {b[1].map((li, j) => (
                <li key={j}>{li}</li>
              ))}
            </ul>
          ),
        )}
      </article>
      <p className="note">Cuidarte+ acompaña, pero no reemplaza la atención profesional.</p>
    </div>
  );
}
