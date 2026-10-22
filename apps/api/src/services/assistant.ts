import type { Deps } from "../deps.js";
import { ARTICLES, FAQ } from "../content/index.js";
import { HttpError } from "../errors.js";
import { addDays, isHHMM, isIsoDate, longDate, nowAR } from "../lib/time.js";
import type { ChatMessage, ToolCall, ToolDef } from "./llm.js";
import { LlmError, LlmRateLimitError } from "./llm.js";
import { listMedications } from "./medications.js";
import { createShifts, listShifts, type Shift } from "./shifts.js";

export const DAILY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 4;
const SAME_DEFAULT = "107";

export class AssistantLimitError extends Error {}
export class AssistantBusyError extends Error {}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
}

const fullName = (p: { first_name: string; last_name: string }) =>
  `${p.first_name} ${p.last_name}`.trim();

export const TOOLS: ToolDef[] = [
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

export function buildSystemPrompt(opts: {
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
  const resources = ARTICLES.map(
    (a) =>
      `## ${a.title}\n` +
      a.body.map((b) => (b[0] === "ul" ? b[1].map((x) => "- " + x).join("\n") : b[1])).join("\n"),
  ).join("\n\n");
  return `Sos el asistente de Cuidarte+, una app de Red Cuidar para personas que cuidan a adultos mayores. Hablás en español rioplatense (vos), con calidez y frases cortas. Respondé en 2 a 6 oraciones, o en una lista corta si ayuda. Sin títulos.
Hoy es ${longDate(t.date)} de ${t.year} (${t.date}). Hora actual: ${hh}. Las semanas empiezan el lunes.
Usuaria/o: ${opts.caregiverName || "sin nombre"}. Pacientes asignados: ${opts.patients.map(fullName).join(", ") || "ninguno"}.
Medicación cargada por el administrador:
${meds || "ninguna"}

Reglas:
- Usá solo la información de este mensaje (recursos, preguntas frecuentes, pacientes, medicación, turnos). Si no lo sabés, decilo y sugerí consultar a un profesional.
- No des diagnósticos ni indiques cambiar dosis o medicación. Para eso, médico tratante.
- Si te cuentan algo que puede ser una urgencia (dolor de pecho, falta de aire, desmayo, caída con golpe en la cabeza, confusión repentina), decí primero que llamen al SAME ${SAME_DEFAULT} ya.
- Si notás agotamiento fuerte, validalo y sugerí una pausa guiada de la app o pedir ayuda concreta.
- Turnos: si la persona cuenta turnos de trabajo (días, horarios, paciente), convertí cada uno a fecha exacta YYYY-MM-DD y horas HH:MM (24 h) y llamá a agregar_turnos UNA sola vez con todos. Un día de la semana sin más ("el lunes") es el próximo a partir de hoy, incluyendo hoy. "La semana que viene" es la semana siguiente de lunes a domingo. "Todos los lunes" sin plazo: cargá las próximas 4 semanas. Si falta el paciente y hay más de uno asignado, preguntá antes de cargar. Si falta el horario, preguntá. Después confirmá en una línea qué quedó cargado y mencioná cualquier error que devuelva la herramienta.
- Para responder sobre turnos ya cargados, usá listar_turnos.

PREGUNTAS FRECUENTES
${FAQ.map((f) => `P: ${f[0]}\nR: ${f[1]}`).join("\n")}

RECURSOS
${resources}`;
}

/** Reserva un mensaje del cupo diario. El control vive en la base: no hay memoria entre invocaciones. */
export async function reserveMessage(deps: Deps, caregiverId: string, date: string): Promise<void> {
  const rows = await deps.sql`
    insert into assistant_usage (caregiver_id, date, messages) values (${caregiverId}, ${date}, 1)
    on conflict (caregiver_id, date) do update set messages = assistant_usage.messages + 1
    where assistant_usage.messages < ${DAILY_LIMIT}
    returning messages`;
  if (!rows.length) throw new AssistantLimitError();
}

const refundMessage = (deps: Deps, caregiverId: string, date: string) =>
  deps.sql`update assistant_usage set messages = greatest(messages - 1, 0) where caregiver_id = ${caregiverId} and date = ${date}`;

export async function runAssistant(
  deps: Deps,
  caregiverId: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ reply: string; added: Shift[] }> {
  const { sql, env, llm, now } = deps;
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
    const meds = await listMedications(
      sql,
      env.MEDICATIONS_KEY,
      patients.map((p) => p.id),
    );
    const medsByPatient = new Map(
      patients.map((p) => [p.id, meds.filter((m) => m.patient_id === p.id)]),
    );

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: buildSystemPrompt({
          now: now(),
          caregiverName: cg ? `${cg.first_name} ${cg.last_names}`.trim() : "",
          patients,
          medsByPatient,
        }),
      },
      ...history,
    ];
    const added: Shift[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await llm.complete({ messages, tools: TOOLS });
      if (!res.tool_calls.length) {
        return {
          reply: res.content?.trim() || "No pude armar una respuesta. Probá de nuevo.",
          added,
        };
      }
      messages.push({ role: "assistant", content: res.content, tool_calls: res.tool_calls });
      for (const call of res.tool_calls) {
        const out = await executeTool(deps, caregiverId, patients, call, added);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
      }
    }
    return {
      reply: "Hice varios intentos y no pude terminar. Probá pedirlo de otra forma.",
      added,
    };
  } catch (e) {
    await refundMessage(deps, caregiverId, today);
    if (e instanceof LlmRateLimitError) throw new AssistantBusyError();
    if (e instanceof LlmError || (e as Error).name === "TimeoutError")
      throw new AssistantBusyError();
    throw e;
  }
}

async function executeTool(
  deps: Deps,
  caregiverId: string,
  patients: Patient[],
  call: ToolCall,
  added: Shift[],
): Promise<unknown> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    return { error: "Argumentos inválidos." };
  }
  const nameOf = new Map(patients.map((p) => [p.id, fullName(p)]));

  if (call.function.name === "listar_turnos") {
    const desde = String(args.desde ?? "");
    const hasta = String(args.hasta ?? "");
    if (!isIsoDate(desde) || !isIsoDate(hasta))
      return { error: "Fechas inválidas, usá YYYY-MM-DD." };
    const to = hasta > addDays(desde, 366) ? addDays(desde, 366) : hasta;
    const list = await listShifts(deps.sql, caregiverId, desde, to);
    return list.map((s) => ({
      fecha: s.date,
      dia: longDate(s.date),
      desde: s.start,
      hasta: s.end,
      paciente: nameOf.get(s.patient_id) ?? "Paciente",
    }));
  }

  if (call.function.name === "agregar_turnos") {
    const list = Array.isArray(args.turnos) ? (args.turnos as Record<string, unknown>[]) : [];
    const ok: unknown[] = [];
    const errores: string[] = [];
    for (const t of list.slice(0, 40)) {
      const name = String(t.paciente ?? "")
        .toLowerCase()
        .trim();
      const p = patients.find(
        (x) =>
          fullName(x).toLowerCase().includes(name) ||
          (name && name.includes(x.first_name.toLowerCase())),
      );
      const fecha = String(t.fecha ?? "");
      const desde = String(t.desde ?? "");
      const hasta = String(t.hasta ?? "");
      if (!p) {
        errores.push(`${t.paciente}: no es un paciente asignado.`);
        continue;
      }
      if (!isIsoDate(fecha) || !isHHMM(desde) || !isHHMM(hasta)) {
        errores.push(`${fecha} ${desde}-${hasta}: formato inválido.`);
        continue;
      }
      if (desde === hasta) {
        errores.push(`${fecha}: el turno no puede durar 0 minutos.`);
        continue;
      }
      try {
        const [created] = await createShifts(
          deps.sql,
          caregiverId,
          [{ patient_id: p.id, date: fecha, start: desde, end: hasta }],
          "assistant",
        );
        added.push(created!);
        ok.push({ fecha, desde, hasta, paciente: fullName(p) });
      } catch (e) {
        if (e instanceof HttpError) errores.push(`${fecha} ${desde}-${hasta}: ${e.message}`);
        else throw e;
      }
    }
    return { agregados: ok, errores };
  }

  return { error: `Herramienta desconocida: ${call.function.name}` };
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
