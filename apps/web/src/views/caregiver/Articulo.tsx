import { Navigate, useParams } from "react-router";
import { BackLink } from "../../components/common";
import { Icon } from "../../components/icons";
import type { IconName } from "../../components/icons";
import { useContent } from "../../api/queries/content";
import { Blocks } from "../../components/Blocks";

export function Articulo() {
  const { id } = useParams();
  const { articles } = useContent();
  const a = articles.find((x) => x.id === id);
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
        <Blocks blocks={a.body} heading="h3" />
      </article>
      <p className="note">Cuidarte+ acompaña, pero no reemplaza la atención profesional.</p>
    </div>
  );
}
