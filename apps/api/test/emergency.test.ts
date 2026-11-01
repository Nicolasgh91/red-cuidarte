import { describe, expect, it } from "vitest";
import { classifyEmergency } from "../src/services/emergency.js";

describe("detección de urgencias", () => {
  it.each([
    "No respira",
    "mi papá no puede respirar",
    "Ya no responde cuando le hablo",
    "no reacciona",
    "Le duele el pecho",
    "le duele mucho el pecho desde hace un rato",
    "¿Qué hago? No respira",
    "qué hago, no respira",
    "Creo que no respira",
    "No sé si le duele el pecho",
    "Sí, no respira bien",
    "Se cayó y se golpeó la cabeza",
    "está convulsionando",
    "se desmayó",
    "Se desmayó ayer y ahora no responde",
    "no tiene tos y le duele el pecho",
    "no le falta el aire pero no reacciona",
    "Ayuda!!! no para de sangrar",
  ])("activa: «%s»", (text) => {
    expect(classifyEmergency(text)).toBe("active");
  });

  it.each([
    "No tiene dolor de pecho",
    "no le duele el pecho, pero está cansada",
    "Respira bien, solo está dormida",
    "sin falta de aire",
    "Ayer se desmayó",
    "Se desmaya seguido",
    "Mi hermana no responde el teléfono",
    "La semana que viene trabajo lunes y miércoles de 8 a 14 con Elena",
    "Estoy agotada, ¿qué puedo hacer hoy?",
  ])("ninguna: «%s»", (text) => {
    expect(classifyEmergency(text)).toBe("none");
  });

  it.each([
    "¿Qué hago si se desmaya?",
    "En caso de que no respire, ¿a quién llamo?",
    "¿Cómo me doy cuenta si le duele el pecho?",
    "¿Cuáles son los síntomas de un infarto, como el dolor de pecho?",
  ])("hipotética: «%s»", (text) => {
    expect(classifyEmergency(text)).toBe("hypothetical");
  });
});
