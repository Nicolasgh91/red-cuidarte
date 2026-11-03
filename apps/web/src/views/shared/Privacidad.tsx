import { useEffect } from "react";
import { Link } from "react-router";
import { useContent } from "../../api/queries/content";
import { Blocks } from "../../components/Blocks";
import { GoBack, SkipLink } from "../../components/common";
import { Logo } from "../../components/icons";
import { DISCLAIMER } from "../../lib/labels";

/**
 * Política de privacidad pública (https://redasistir.online/privacidad).
 * BORRADOR: debe revisarlo un profesional legal (Ley 25.326) antes de publicar la app (roadmap F10).
 */
export function Privacidad() {
  const { privacidad } = useContent();
  useEffect(() => {
    document.title = `${privacidad.title} · Cuidarte+`;
  }, [privacidad.title]);
  return (
    <div className="shell bare">
      <SkipLink />
      <header className="top">
        <Link to="/" className="logo">
          <Logo />
          Cuidarte+
        </Link>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page narrow" style={{ maxWidth: 668 }}>
          <GoBack fallback="/" />
          <h1>{privacidad.title}</h1>
          {privacidad.note && <p className="note">{privacidad.note}</p>}
          <div className="prose">
            <Blocks blocks={privacidad.blocks} />
          </div>
          <p className="disclaimer">{DISCLAIMER}</p>
        </div>
      </main>
    </div>
  );
}
