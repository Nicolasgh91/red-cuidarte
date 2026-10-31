import type { Block } from "../content";

/**
 * Edición de recursos y páginas como texto simple:
 *   `## Título` es un subtítulo, las líneas que empiezan con `- ` forman una lista y el resto son
 *   párrafos separados por una línea en blanco.
 */
export function blocksToText(blocks: readonly Block[]): string {
  return blocks
    .map((b) =>
      b[0] === "h" ? `## ${b[1]}` : b[0] === "ul" ? b[1].map((li) => `- ${li}`).join("\n") : b[1],
    )
    .join("\n\n");
}

export function textToBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(["p", para.join(" ")]);
    if (list.length) blocks.push(["ul", list]);
    para = [];
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^##(?:\s+(.*))?$/.exec(line);
    const item = /^-(?:\s+(.*))?$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      if (heading[1]) blocks.push(["h", heading[1].trim()]);
    } else if (item) {
      if (para.length) flush();
      if (item[1]) list.push(item[1].trim());
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}
