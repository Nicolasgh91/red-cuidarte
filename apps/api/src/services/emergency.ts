// Urgencias en el último mensaje del cuidador, detectadas antes de llamar al modelo: así el aviso
// sale aunque Groq esté caído, sin cupo o tarde. Ante la duda avisa: un falso positivo cuesta una
// línea de más; un falso negativo puede costar mucho más.
import { fold } from "../lib/text.js";

export type EmergencyKind = "active" | "hypothetical" | "none";

// Pendiente: validarlo con un profesional de Red Cuidar antes de lanzar (docs/ops.md).
export const EMERGENCY_REPLY =
  "Llamá ya al SAME 107. Quedate con la persona hasta que llegue la ayuda. No le des comida, bebida ni medicación. Si no respira y sabés hacer RCP, empezá. Si se cayó, no la muevas salvo que haya peligro.";

/** Síntomas presentes. Incluyen las negaciones que son el síntoma («no respira», «no reacciona»). */
const PRESENT: RegExp[] = [
  // respiración
  /\bno (puede )?respir(a|e|ar|aba)\b/,
  /\b(deja|dejo|dejara) de respirar\b/,
  /\ble falta (el )?aire\b/,
  /\bfalta de aire\b/,
  /\bse (esta )?ahog(a|ando)\b/,
  /\brespira con (mucha )?dificultad\b/,
  // conciencia
  /\bno reacciona\b/,
  /\bno responde\b/,
  /\bse desmay(o|a|e)\b/,
  /\bperdio (el )?conocimiento\b/,
  /\besta inconsciente\b/,
  /\bno se despierta\b/,
  // pecho
  /\bduele (mucho )?(el )?pecho\b/,
  /\bdolor (de|en el) pecho\b/,
  /\b(o)?presion en el pecho\b/,
  // golpe en la cabeza
  /\bse (golpeo|pego|dio un golpe)( en)? la cabeza\b/,
  /\bgolpe (fuerte )?en la cabeza\b/,
  /\bse cayo\b.*\bcabeza\b/,
  // neurológicas
  /\bconvulsion/,
  /\bno puede hablar\b/,
  /\b(cara|boca) torcida\b/,
  /\bno (puede mover|mueve) (el brazo|la pierna|un lado|medio cuerpo)\b/,
  /\bconfusion repentina\b/,
  /\bde repente\b.*\bconfundid[oa]\b/,
  // sangrado
  /\bno (para|deja) de sangrar\b/,
  /\bsangra mucho\b/,
  /\bsangrado que no para\b/,
];

/** Frases que descartan un síntoma. Se tachan antes de buscar los presentes. */
const ABSENT: RegExp[] = [
  // «no respira bien» es un síntoma: no se tacha.
  /(?<!\bno )\brespira bien\b/g,
  /\bsin (falta de aire|dificultad para respirar|dolor (de|en el) pecho)\b/g,
  /\bno le falta (el )?aire\b/g,
  /\bno tiene falta de aire\b/g,
  /\bno (tiene|siente|tuvo|hay) (dolor|presion|opresion|molestias?) (de|en el) pecho\b/g,
  /\bno le (duele|dolio) (el )?pecho\b/g,
  /\bno (me )?responde (el |los |mis |a )?(telefono|celular|mensajes?|llamadas?|whatsapp|mails?)\b/g,
];

/** Pregunta hipotética, si aparece antes del síntoma. «No sé si…» no cuenta: es duda, no hipótesis. */
const HYPOTHETICAL: RegExp[] = [
  /(?<!\bno se |\bsegur[oa] |\bsegur[oa] de )\bsi (se|le|la|lo|llega|llegara|tiene|tuviera|deja|dejara|no|empieza|pasa|me|un|una|alguien|mi)\b/,
  /\ben caso de\b/,
  /\bcomo (me doy cuenta|se si|reconozco|identifico)\b/,
  /\b(sintomas|senales) de\b/,
];

/** Algo que pasó antes o que pasa seguido: lo responde el modelo (consultar al médico). */
const NOT_NOW =
  /\b(ayer|anoche|anteayer|el otro dia|la semana pasada|el mes pasado|el ano pasado|hace (unos |unas |un |una |dos |tres |\d+ )?(dias?|semanas?|mes|meses|anos?)|seguido|a veces|a menudo|cada tanto|de vez en cuando|suele|frecuentemente|muchas veces)\b/;
const NOW = /\b(ahora|recien|en este momento|todavia|sigue)\b/;

export function classifyEmergency(text: string): EmergencyKind {
  let hypothetical = false;
  for (const raw of text.split(/[.!?¿¡;\n]+/)) {
    // «Sí» afirma: sin tilde se confundiría con el «si» condicional.
    let s = fold(raw.replace(/(^|[^\p{L}])sí(?!\p{L})/giu, "$1afirmativo"));
    for (const re of ABSENT) s = s.replace(re, " | ");
    const found = PRESENT.map((re) => s.search(re)).filter((i) => i >= 0);
    if (!found.length || (NOT_NOW.test(s) && !NOW.test(s))) continue;
    const first = Math.min(...found);
    const hypo = HYPOTHETICAL.some((re) => {
      const i = s.search(re);
      return i >= 0 && i < first;
    });
    if (!hypo) return "active";
    hypothetical = true;
  }
  return hypothetical ? "hypothetical" : "none";
}
