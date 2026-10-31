import { useContent } from "../../api/queries/content";
import { Blocks } from "../../components/Blocks";

export function Acerca() {
  const { acerca } = useContent();
  return (
    <div className="page narrow">
      <div className="head">
        <h1>{acerca.title}</h1>
        {acerca.sub && <p className="sub">{acerca.sub}</p>}
      </div>
      <div className="prose">
        <Blocks blocks={acerca.blocks} leadClass="about-lead" />
        {acerca.note && <p className="note">{acerca.note}</p>}
      </div>
    </div>
  );
}
