import { describe, expect, it } from "vitest";
import type { Block } from "../content";
import { blocksToText, textToBlocks } from "./blocksText";

const blocks: Block[] = [
  ["p", "Un párrafo."],
  ["h", "Subtítulo"],
  ["ul", ["uno", "dos"]],
  ["p", "Otro párrafo."],
];

describe("texto ↔ bloques", () => {
  it("serializa y vuelve a leer sin perder nada", () => {
    const text = blocksToText(blocks);
    expect(text).toBe("Un párrafo.\n\n## Subtítulo\n\n- uno\n- dos\n\nOtro párrafo.");
    expect(textToBlocks(text)).toEqual(blocks);
  });

  it("separa párrafos por línea en blanco y junta las líneas seguidas", () => {
    expect(textToBlocks("primera\nsegunda línea\n\n\ntercera")).toEqual([
      ["p", "primera segunda línea"],
      ["p", "tercera"],
    ]);
  });

  it("un subtítulo o una lista cortan el párrafo aunque no haya línea en blanco", () => {
    expect(textToBlocks("intro\n## Título\n- a\n- b\nfin")).toEqual([
      ["p", "intro"],
      ["h", "Título"],
      ["ul", ["a", "b"]],
      ["p", "fin"],
    ]);
  });

  it("ignora espacios, saltos de Windows y renglones vacíos", () => {
    expect(textToBlocks("  hola  \r\n\r\n##   \r\n-   \r\n- x ")).toEqual([
      ["p", "hola"],
      ["ul", ["x"]],
    ]);
    expect(textToBlocks("   \n\n")).toEqual([]);
  });
});
