import { describe, expect, it } from "vitest";
import { ENERGY, MOODS, STRESS, indexToLabel, labelToIndex, quoteOfDay, QUOTES } from "./labels";

describe("escalas de bienestar (etiqueta ↔ índice 0–4)", () => {
  it("cada etiqueta mapea a su posición", () => {
    expect(MOODS.map((l) => labelToIndex(MOODS, l))).toEqual([0, 1, 2, 3, 4]);
    expect(labelToIndex(ENERGY, "Muy poca")).toBe(0);
    expect(labelToIndex(STRESS, "Muy alto")).toBe(4);
  });
  it("ida y vuelta", () => {
    for (const scale of [MOODS, ENERGY, STRESS]) {
      for (let i = 0; i < 5; i++) expect(labelToIndex(scale, indexToLabel(scale, i))).toBe(i);
    }
  });
  it("etiqueta desconocida o vacía → -1", () => {
    expect(labelToIndex(MOODS, "Genial")).toBe(-1);
    expect(labelToIndex(MOODS, null)).toBe(-1);
  });
  it("los promedios se redondean a la etiqueta más cercana y se acotan", () => {
    expect(indexToLabel(MOODS, 2.4)).toBe("Neutral");
    expect(indexToLabel(MOODS, 2.6)).toBe("Bien");
    expect(indexToLabel(MOODS, -3)).toBe("Muy bajo");
    expect(indexToLabel(MOODS, 9)).toBe("Muy bien");
  });
  it("la frase del día es una de las frases", () => {
    expect(QUOTES).toContain(quoteOfDay(new Date(2026, 9, 22)));
  });
});
