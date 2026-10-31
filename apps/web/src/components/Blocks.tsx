import type { ReactNode } from "react";
import type { Block } from "../content";

const EMAIL = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

/** Los mails dentro de un texto se vuelven enlaces; el resto queda como texto. */
function withLinks(text: string): ReactNode[] {
  return text.split(EMAIL).map((part, i) =>
    i % 2 ? (
      <a key={i} href={`mailto:${part}`}>
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/** Párrafos, subtítulos y listas de un recurso o de una página. */
export function Blocks({
  blocks,
  heading: H = "h2",
  leadClass,
}: {
  blocks: readonly Block[];
  heading?: "h2" | "h3";
  /** Clase del primer párrafo, para destacarlo como bajada. */
  leadClass?: string;
}) {
  const firstParagraph = blocks.findIndex((b) => b[0] === "p");
  return (
    <>
      {blocks.map((b, i) => {
        if (b[0] === "h") return <H key={i}>{b[1]}</H>;
        if (b[0] === "ul") {
          return (
            <ul key={i}>
              {b[1].map((li, j) => (
                <li key={j}>{withLinks(li)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className={i === firstParagraph ? leadClass : undefined}>
            {withLinks(b[1])}
          </p>
        );
      })}
    </>
  );
}
