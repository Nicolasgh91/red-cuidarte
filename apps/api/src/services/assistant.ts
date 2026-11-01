import type { Deps } from "../deps.js";
import type { Article } from "../content/index.js";
import { HttpError } from "../errors.js";
import { fold } from "../lib/text.js";
import { addDays, isHHMM, isIsoDate, longDate, nowAR } from "../lib/time.js";
import type { ChatMessage, LlmUsage, ToolCall, ToolDef } from "./llm.js";
import { LlmError, timeoutError } from "./llm.js";
import { loadContent } from "./content.js";
import { classifyEmergency, EMERGENCY_REPLY } from "./emergency.js";
import { listMedications } from "./medications.js";
import { createShifts, listShifts, type Shift } from "./shifts.js";

const DAILY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 4;
const SAME_DEFAULT = "107";
/** Plazo total de una consulta: menor que el timeout del cliente web (20 s), así nunca corta antes. */
export const ASSISTANT_DEADLINE_MS = 17_000;

/** Largo máximo de un mensaje del chat (lo valida la ruta). */
export const MAX_MESSAGE_CHARS = 2000;
/** Presupuesto del historial que se manda a Groq, sin excepciones. */
const HISTORY_MAX_TOKENS = 1500;
/** Intercambios recientes (usuario + asistente) que se priorizan, recortando respuestas si hace falta. */
const RECENT_EXCHANGES = 3;
/** Una respuesta recortada a menos de esto no aporta: se corta ahí. */
const MIN_TRIMMED_TOKENS = 30;

/** Estimación conservadora para el español (~3,5–4 caracteres por token). */
const estTokens = (s: string) => Math.ceil(s.length / 3);

// El último mensaje del usuario tiene que entrar siempre entero.
if (HISTORY_MAX_TOKENS < estTokens("x".repeat(MAX_MESSAGE_CHARS)))
  throw new Error("HISTORY_MAX_TOKENS no alcanza para un mensaje de largo máximo");

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
}

type Turn = { role: "user" | "assistant"; content: string };

const fullName = (p: { first_name: string; last_name: string }) =>
  `${p.first_name} ${p.last_name}`.trim();

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "listar_turnos",
      description:
        "Devuelve los turnos de la persona entre dos fechas (incluidas). Usalo para responder qué turnos tiene.",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "YYYY-MM-DD" },
          hasta: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["desde", "hasta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agregar_turnos",
      description:
        "Agrega uno o más turnos al calendario de la persona. Devuelve los agregados y los errores (por ejemplo superposición o paciente desconocido).",
      parameters: {
        type: "object",
        properties: {
          turnos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                paciente: { type: "string", description: "Nombre del paciente asignado" },
                fecha: { type: "string", description: "YYYY-MM-DD" },
                desde: { type: "string", description: "HH:MM 24 h" },
                hasta: { type: "string", description: "HH:MM 24 h" },
              },
              required: ["paciente", "fecha", "desde", "hasta"],
            },
          },
        },
        required: ["turnos"],
      },
    },
  },
];

/**
 * Parte fija del contexto: igual para todos y a cualquier hora, para que Groq la cachee (los tokens
 * cacheados no cuentan para el límite por minuto). Lo que cambia va en buildContextPrompt.
 */
function buildStaticPrompt(opts: {
  /** Recursos y preguntas frecuentes vigentes (los que edita el admin). */
  articles: readonly Article[];
  faq: readonly (readonly [string, string])[];
}): string {
  const resources = opts.articles
    .map(
      (a) =>
        `## ${a.title}\n` +
        a.body.map((b) => (b[0] === "ul" ? b[1].map((x) => "- " + x).join("\n") : b[1])).join("\n"),
    )
    .join("\n\n");
  return `Sos el asistente de Cuidarte+, una app de Red Cuidar para personas que cuidan a adultos mayores. Hablás en español rioplatense (vos), con calidez y frases cortas. Respondé en 2 a 6 oraciones, o en una lista corta si ayuda. Sin títulos.

Reglas:
- Usá solo la información de estos mensajes (recursos, preguntas frecuentes, pacientes, medicación, turnos). Si no lo sabés, decilo y sugerí consultar a un profesional.
- No des diagnósticos ni indiques cambiar dosis o medicación. Para eso, médico tratante.
- Si te cuentan algo que puede ser una urgencia (dolor de pecho, falta de aire, desmayo, caída con golpe en la cabeza, confusión repentina), decí primero que llamen al SAME ${SAME_DEFAULT} ya.
- Si notás agotamiento fuerte, validalo y sugerí una pausa guiada de la app o pedir ayuda concreta.
- Turnos: si la persona cuenta turnos de trabajo (días, horarios, paciente), convertí cada uno a fecha exacta YYYY-MM-DD y horas HH:MM (24 h) y llamá a agregar_turnos UNA sola vez con todos. Las semanas empiezan el lunes. Un día de la semana sin más ("el lunes") es el próximo a partir de hoy, incluyendo hoy. "La semana que viene" es la semana siguiente de lunes a domingo. "Todos los lunes" sin plazo: cargá las próximas 4 semanas. Si falta el paciente y hay más de uno asignado, preguntá antes de cargar. Si falta el horario, preguntá.
- Para responder sobre turnos ya cargados, usá listar_turnos.

PREGUNTAS FRECUENTES
${opts.faq.map((f) => `P: ${f[0]}\nR: ${f[1]}`).join("\n")}

RECURSOS
${resources}`;
}

/** Parte que cambia por persona y por minuto: va después de la fija. */
function buildContextPrompt(opts: {
  now: Date;
  caregiverName: string;
  patients: Patient[];
  medsByPatient: Map<string, { name: string; dose: string; times: string[] }[]>;
}): string {
  const t = nowAR(opts.now);
  const hh = `${String(Math.floor(t.minutes / 60)).padStart(2, "0")}:${String(t.minutes % 60).padStart(2, "0")}`;
  const meds = opts.patients
    .map((p) => {
      const list = opts.medsByPatient.get(p.id) ?? [];
      return `${fullName(p)}: ${list.length ? list.map((m) => `${m.name} ${m.dose} a las ${m.times.join(" y ")}`).join("; ") : "sin medicación cargada"}`;
    })
    .join("\n");
  return `Hoy es ${longDate(t.date)} de ${t.year} (${t.date}). Hora actual: ${hh}.
Usuaria/o: ${opts.caregiverName || "sin nombre"}. Pacientes asignados: ${opts.patients.map(fullName).join(", ") || "ninguno"}.
Medicación cargada en la ficha de cada paciente:
${meds || "ninguna"}`;
}

/** Recorta conservando el final, donde suele estar la pregunta. `tokens` ≥ 1. */
const keepEnd = (s: string, tokens: number) =>
  estTokens(s) <= tokens ? s : "…" + s.slice(-(tokens * 3 - 1));

/**
 * Historial que entra en HISTORY_MAX_TOKENS. Siempre van el último mensaje del usuario y la respuesta
 * anterior del asistente (recortada si hace falta: sin ella no se entiende un «con Elena»). Después,
 * hacia atrás, los últimos intercambios (recortando respuestas del asistente) y, si sobra, los
 * anteriores enteros. Es siempre un sufijo de la conversación.
 */
export function fitHistory(history: Turn[]): Turn[] {
  const last = history.at(-1);
  if (!last) return [];
  const out: Turn[] = [last];
  let left = HISTORY_MAX_TOKENS - estTokens(last.content);
  let users = 0;
  for (let i = history.length - 2; i >= 0; i--) {
    let m = history[i]!;
    if (estTokens(m.content) > left) {
      const trimmable =
        m.role === "assistant" &&
        users < RECENT_EXCHANGES &&
        left > 0 &&
        (i === history.length - 2 || left >= MIN_TRIMMED_TOKENS);
      if (!trimmable) break;
      m = { ...m, content: keepEnd(m.content, left) };
    }
    out.unshift(m);
    left -= estTokens(m.content);
    if (m.role === "user") users++;
  }
  return out;
}

/** Reserva un mensaje del cupo diario. El control vive en la base: no hay memoria entre invocaciones. */
async function reserveMessage(deps: Deps, caregiverId: string, date: string): Promise<void> {
  const rows = await deps.sql`
    insert into assistant_usage (caregiver_id, date, messages) values (${caregiverId}, ${date}, 1)
    on conflict (caregiver_id, date) do update set messages = assistant_usage.messages + 1
    where assistant_usage.messages < ${DAILY_LIMIT}
    returning messages`;
  if (!rows.length) {
    throw new HttpError(
      429,
      "assistant_limit",
      `Llegaste al límite de ${DAILY_LIMIT} mensajes de hoy. Mañana podés seguir.`,
    );
  }
}

const refundMessage = (deps: Deps, caregiverId: string, date: string) =>
  deps.sql`update assistant_usage set messages = greatest(messages - 1, 0) where caregiver_id = ${caregiverId} and date = ${date}`;

/** Corta la espera al llegar al plazo, aunque el cliente del LLM no lo respete. */
async function withDeadline<T>(p: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError()), Math.max(0, deadline - Date.now()));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runAssistant(
  deps: Deps,
  caregiverId: string,
  history: Turn[],
  deadlineMs = ASSISTANT_DEADLINE_MS,
): Promise<{ reply: string; added: Shift[] }> {
  const { sql, env, llm, now } = deps;
  const started = Date.now();
  const deadline = started + deadlineMs;
  const spent = { calls: 0, prompt: 0, cached: 0, completion: 0, finish: [] as string[] };
  let limits: LlmUsage["limits"] = {};
  // Una línea por consulta, sin texto ni datos personales: es lo que se mira para medir el consumo.
  const logUsage = (path: "emergency" | "llm" | "tool_rendered" | "error") =>
    console.info("assistant usage", {
      path,
      ...spent,
      effective: spent.prompt - spent.cached + spent.completion,
      cache_hit: spent.prompt ? Math.round((spent.cached / spent.prompt) * 100) / 100 : 0,
      ms: Date.now() - started,
      limits,
    });

  // Una urgencia se responde acá: no depende de Groq ni del cupo diario.
  if (classifyEmergency(history.at(-1)?.content ?? "") === "active") {
    logUsage("emergency");
    return { reply: EMERGENCY_REPLY, added: [] };
  }

  const today = nowAR(now()).date;
  await reserveMessage(deps, caregiverId, today);

  try {
    const [cg] = await sql<
      { first_name: string; last_names: string }[]
    >`select first_name, last_names from caregivers where user_id = ${caregiverId}`;
    const patientRows = await sql<{ user_id: string; first_name: string; last_name: string }[]>`
      select p.user_id, p.first_name, p.last_name from caregiver_patients cp join patients p on p.user_id = cp.patient_id
      where cp.caregiver_id = ${caregiverId} order by p.first_name`;
    const patients: Patient[] = patientRows.map((p) => ({
      id: p.user_id,
      first_name: p.first_name,
      last_name: p.last_name,
    }));
    const medsByPatient = await listMedications(
      sql,
      env.MEDICATIONS_KEY,
      patients.map((p) => p.id),
    );

    const { articles, faq } = (await loadContent(sql)).content;
    const messages: ChatMessage[] = [
      { role: "system", content: buildStaticPrompt({ articles, faq }) },
      {
        role: "system",
        content: buildContextPrompt({
          now: now(),
          caregiverName: cg ? `${cg.first_name} ${cg.last_names}`.trim() : "",
          patients,
          medsByPatient,
        }),
      },
      ...fitHistory(history),
    ];
    const added: Shift[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await withDeadline(llm.complete({ messages, tools: TOOLS, deadline }), deadline);
      spent.calls++;
      if (res.usage) {
        spent.prompt += res.usage.prompt;
        spent.cached += res.usage.cached;
        spent.completion += res.usage.completion;
        if (res.usage.finish) spent.finish.push(res.usage.finish);
        limits = res.usage.limits;
      }
      if (!res.tool_calls.length) {
        logUsage("llm");
        return {
          reply: res.content?.trim() || "No pude armar una respuesta. Probá de nuevo.",
          added,
        };
      }
      const seen = new Set<string>();
      const outs: ToolOut[] = [];
      for (const call of res.tool_calls) {
        outs.push(await executeTool(deps, caregiverId, patients, call, added, seen));
      }
      // La respuesta sale de los resultados, sin otra llamada. Y después de intentar escribir nunca
      // se vuelve al modelo: otra ronda podría cargar los mismos turnos de nuevo.
      if (outs.some((o) => "agregados" in o) || outs.every((o) => !("error" in o))) {
        logUsage("tool_rendered");
        return { reply: renderToolReply(outs), added };
      }
      messages.push({ role: "assistant", content: res.content, tool_calls: res.tool_calls });
      res.tool_calls.forEach((call, i) => {
        const o = outs[i]!;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(
            "turnos" in o ? o.turnos : { error: "error" in o ? o.error : "" },
          ),
        });
      });
    }
    logUsage("llm");
    return {
      reply: "Hice varios intentos y no pude terminar. Probá pedirlo de otra forma.",
      added,
    };
  } catch (e) {
    await refundMessage(deps, caregiverId, today);
    const timeout = (e as Error).name === "TimeoutError";
    if (!(e instanceof LlmError) && !timeout) throw e;
    const status = e instanceof LlmError ? e.status : undefined;
    // Sin esto la causa real (key, modelo, límite) no queda en ningún lado: el usuario solo ve el 429/503.
    console.error("assistant llm", {
      status,
      code: e instanceof LlmError ? e.code : undefined,
      limit: e instanceof LlmError ? e.limit : undefined,
      message: (e as Error).message,
    });
    logUsage("error");
    if (timeout || status === undefined || status === 429 || status >= 500) {
      throw new HttpError(
        429,
        "assistant_busy",
        "Hay muchas consultas seguidas. Probá de nuevo en un rato.",
      );
    }
    // 401/403/404/400/413: configuración o pedido, no carga. Reintentar no sirve.
    throw new HttpError(
      503,
      "assistant_unavailable",
      "El asistente no está disponible en este momento. Probá más tarde.",
    );
  }
}

interface ShiftLine {
  fecha: string;
  desde: string;
  hasta: string;
  paciente: string;
}

type ToolOut =
  | { tool: "listar_turnos"; desde: string; hasta: string; turnos: (ShiftLine & { dia: string })[] }
  | { tool: "agregar_turnos"; agregados: ShiftLine[]; ya_cargados: ShiftLine[]; errores: string[] }
  | { tool: string; error: string };

/** El paciente por nombre (sin tildes ni mayúsculas), o el error para la persona. */
function matchPatient(name: string, patients: Patient[]): Patient | string {
  const n = fold(name);
  if (!patients.length) return "No tenés pacientes asignados.";
  if (!n)
    return patients.length === 1
      ? patients[0]!
      : "Falta el paciente: decime con quién es cada turno.";
  const hits = patients.filter((p) => {
    const first = fold(p.first_name);
    return fold(fullName(p)).includes(n) || (first !== "" && n.includes(first));
  });
  if (hits.length === 1) return hits[0]!;
  return hits.length
    ? `${name}: hay más de un paciente con ese nombre.`
    : `${name}: no es un paciente asignado.`;
}

async function executeTool(
  deps: Deps,
  caregiverId: string,
  patients: Patient[],
  call: ToolCall,
  added: Shift[],
  /** Turnos ya vistos en esta ronda: uno repetido no se intenta dos veces. */
  seen: Set<string>,
): Promise<ToolOut> {
  const tool = call.function.name;
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    return { tool, error: "Argumentos inválidos." };
  }
  const nameOf = new Map(patients.map((p) => [p.id, fullName(p)]));

  if (tool === "listar_turnos") {
    const desde = String(args.desde ?? "");
    const hasta = String(args.hasta ?? "");
    if (!isIsoDate(desde) || !isIsoDate(hasta))
      return { tool, error: "Fechas inválidas, usá YYYY-MM-DD." };
    const to = hasta > addDays(desde, 366) ? addDays(desde, 366) : hasta;
    const list = await listShifts(deps.sql, caregiverId, desde, to);
    return {
      tool,
      desde,
      hasta: to,
      turnos: list.map((s) => ({
        fecha: s.date,
        dia: longDate(s.date),
        desde: s.start,
        hasta: s.end,
        paciente: nameOf.get(s.patient_id) ?? "Paciente",
      })),
    };
  }

  if (tool === "agregar_turnos") {
    if (!Array.isArray(args.turnos) || !args.turnos.length)
      return { tool, error: "Falta la lista de turnos." };
    const out = {
      tool: "agregar_turnos" as const,
      agregados: [] as ShiftLine[],
      ya_cargados: [] as ShiftLine[],
      errores: [] as string[],
    };
    for (const t of (args.turnos as Record<string, unknown>[]).slice(0, 40)) {
      const p = matchPatient(String(t.paciente ?? ""), patients);
      const fecha = String(t.fecha ?? "");
      const desde = String(t.desde ?? "");
      const hasta = String(t.hasta ?? "");
      if (typeof p === "string") {
        out.errores.push(p);
        continue;
      }
      if (!isIsoDate(fecha) || !isHHMM(desde) || !isHHMM(hasta)) {
        out.errores.push(`${fecha} ${desde}-${hasta}: formato inválido.`);
        continue;
      }
      if (desde === hasta) {
        out.errores.push(`${fecha}: el turno no puede durar 0 minutos.`);
        continue;
      }
      const key = `${p.id}|${fecha}|${desde}|${hasta}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = { fecha, desde, hasta, paciente: fullName(p) };
      try {
        const [created] = await createShifts(
          deps.sql,
          caregiverId,
          [{ patient_id: p.id, date: fecha, start: desde, end: hasta }],
          "assistant",
        );
        added.push(created!);
        out.agregados.push(line);
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        // Un pedido repetido (reintento, otro mensaje igual) choca con su propio turno: no es un error.
        const same =
          e.code === "shift_overlap" &&
          (
            await deps.sql`select 1 from shifts where caregiver_id = ${caregiverId} and patient_id = ${p.id}
              and date = ${fecha} and start_time = ${desde} and end_time = ${hasta}`
          ).length > 0;
        if (same) out.ya_cargados.push(line);
        else out.errores.push(`${fecha} ${desde}-${hasta}: ${e.message}`);
      }
    }
    return out;
  }

  return { tool, error: `Herramienta desconocida: ${tool}` };
}

/** «miércoles 21 de octubre» */
const dayLabel = (date: string) => longDate(date).replace(",", "").toLowerCase();

/** Respuesta armada con los resultados efectivos de las herramientas (sin otra llamada al modelo). */
function renderToolReply(outs: ToolOut[]): string {
  const lines: string[] = [];
  const adds = outs.flatMap((o) => ("agregados" in o ? [o] : []));
  if (adds.length) {
    const ok = adds.flatMap((o) => o.agregados).length;
    const errores = adds.flatMap((o) => o.errores);
    const total = ok + errores.length;
    if (ok && !errores.length) lines.push(`Listo, cargué ${ok} ${ok === 1 ? "turno" : "turnos"}.`);
    else if (ok) lines.push(`Cargué ${ok} de ${total} turnos.`);
    else if (errores.length)
      lines.push(total === 1 ? "No pude cargar el turno." : "No pude cargar los turnos.");
    for (const t of adds.flatMap((o) => o.ya_cargados)) {
      lines.push(
        `El ${dayLabel(t.fecha)} de ${t.desde} a ${t.hasta} con ${t.paciente} ya estaba cargado.`,
      );
    }
    lines.push(...errores.map((e) => `- ${e}`));
  }
  for (const o of outs) {
    if ("turnos" in o) {
      const range =
        o.desde === o.hasta
          ? `el ${dayLabel(o.desde)}`
          : `entre el ${dayLabel(o.desde)} y el ${dayLabel(o.hasta)}`;
      if (!o.turnos.length) lines.push(`No tenés turnos ${range}.`);
      else {
        lines.push(
          `Tus turnos ${range}:`,
          ...o.turnos.map((t) => `- ${t.dia}: de ${t.desde} a ${t.hasta} con ${t.paciente}`),
        );
      }
    } else if ("error" in o && o.tool === "listar_turnos") {
      lines.push("No pude consultar tus turnos. Preguntame de nuevo.");
    }
  }
  return lines.join("\n") || "Listo.";
}

/** Deshacer: borra solo turnos propios cargados por el asistente. */
export async function undoAssistantShifts(
  deps: Deps,
  caregiverId: string,
  ids: string[],
): Promise<number> {
  if (!ids.length) return 0;
  const rows = await deps.sql`
    delete from shifts where caregiver_id = ${caregiverId} and source = 'assistant' and id in ${deps.sql(ids)} returning id`;
  return rows.length;
}
