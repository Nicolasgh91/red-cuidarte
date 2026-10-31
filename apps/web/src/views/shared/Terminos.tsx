import { useContent } from "../../api/queries/content";
import { Blocks } from "../../components/Blocks";
import { GoBack } from "../../components/common";
import { DISCLAIMER } from "../../lib/labels";

export function Terminos() {
  const { terminos } = useContent();
  return (
    <div className="page narrow" style={{ maxWidth: 668 }}>
      <GoBack fallback="/" />
      <h1>{terminos.title}</h1>
      {terminos.note && <p className="note">{terminos.note}</p>}
      <div className="prose">
        <Blocks blocks={terminos.blocks} />
      </div>
      <p className="disclaimer">{DISCLAIMER}</p>
    </div>
  );
}
