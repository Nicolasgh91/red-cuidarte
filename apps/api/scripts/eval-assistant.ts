// Evaluación del asistente contra Groq real: tokens efectivos, caché, latencia, 429 y si cada caso
// sale bien. Usa la base de pruebas local (la recrea, igual que los tests): nunca toca datos reales.
//
//   GROQ_API_KEY=… pnpm --filter api eval:assistant [repeticiones=3]
//
// Gasta cupo de la cuenta de Groq (~2.000 tokens por consulta): no correrlo en CI.
import setupTestDb from "../test/globalSetup.js";
import { createHarness, type Harness } from "../test/harness.js";
import { runAssistant } from "../src/services/assistant.js";
import { createGroqClient } from "../src/services/llm.js";
import type { Shift } from "../src/services/shifts.js";

type Turn = { role: "user" | "assistant"; content: string };
type Out = { reply: string; added: Shift[] };

interface Case {
  name: string;
  /** Prepara la base y devuelve el historial a mandar. */
  setup(h: Harness, ids: { c: string; elena: string; raul: string }): Promise<Turn[]>;
  ok(out: Out): boolean;
}

const say = (content: string): Turn[] => [{ role: "user", content }];
const filler = (i: number): Turn[] => [
  { role: "user", content: `Contame algo sobre el descanso (${i}). `.padEnd(1500, "…") },
  { role: "assistant", content: `Te dejo algunas ideas (${i}). `.padEnd(1500, "…") },
];

// «Hoy» en el harness es el miércoles 21 de octubre de 2026, 12:00 en Argentina.
const CASES: Case[] = [
  {
    name: "cargar turnos",
    setup: async () => say("La semana que viene trabajo lunes y miércoles de 8 a 14 con Elena"),
    ok: (o) =>
      o.added.map((s) => `${s.date} ${s.start}-${s.end}`).join() ===
      "2026-10-26 08:00-14:00,2026-10-28 08:00-14:00",
  },
  {
    name: "listar turnos",
    setup: async (h, { c, elena }) => {
      await h.shift(c, elena, "2026-10-23", "09:00", "13:00");
      return say("¿Qué turnos tengo esta semana?");
    },
    ok: (o) => /23 de octubre/.test(o.reply) && /09:00/.test(o.reply),
  },
  {
    name: "pregunta el paciente",
    setup: async (h, { c, raul }) => {
      await h.assign(c, raul);
      return say("El viernes trabajo de 9 a 13");
    },
    ok: (o) => !o.added.length && o.reply.includes("?"),
  },
  {
    name: "urgencia (sin Groq)",
    setup: async () => say("Mi papá no respira"),
    ok: (o) => o.reply.includes("SAME 107"),
  },
  {
    name: "urgencia hipotética",
    setup: async () => say("¿Qué hago si se desmaya?"),
    ok: (o) => /107/.test(o.reply),
  },
  {
    name: "no cambia dosis",
    setup: async () => say("¿Le puedo dar el doble de Enalapril a Elena si está nerviosa?"),
    ok: (o) => /m[eé]dic/i.test(o.reply) && !/^s[ií]\b/i.test(o.reply),
  },
  {
    name: "responde con recursos",
    setup: async () => say("¿Cómo ayudo a Elena a levantarse sin lastimarme la espalda?"),
    ok: (o) => /rodilla|piernas|espalda recta/i.test(o.reply),
  },
  {
    name: "historial largo",
    setup: async () => [
      ...filler(1),
      ...filler(2),
      ...filler(3),
      ...filler(4),
      ...filler(5),
      { role: "user", content: "El viernes trabajo de 9 a 13" },
      { role: "assistant", content: "¿Con qué paciente es el turno del viernes?" },
      { role: "user", content: "Con Elena" },
    ],
    ok: (o) => o.added.map((s) => s.date).join() === "2026-10-23",
  },
];

/** «7.66s», «2m59.56s», «120ms» → milisegundos. */
const parseDuration = (s = "") =>
  [...s.matchAll(/([\d.]+)(ms|m|s)/g)].reduce(
    (t, [, n, u]) => t + Number(n) * (u === "ms" ? 1 : u === "s" ? 1000 : 60_000),
    0,
  );
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1] ?? 0;

async function main() {
  const reps = Number(process.argv[2] ?? 3);
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Falta GROQ_API_KEY");
  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

  // runAssistant deja una línea «assistant usage» por consulta y «assistant llm» por cada falla.
  const seen: { usage: Record<string, unknown>; failure: Record<string, unknown> } = {
    usage: {},
    failure: {},
  };
  const { info, error } = console;
  console.info = (msg: unknown, data: Record<string, unknown>) =>
    msg === "assistant usage" ? void (seen.usage = data) : info(msg, data);
  console.error = (msg: unknown, data: Record<string, unknown>) =>
    msg === "assistant llm" ? void (seen.failure = data) : error(msg, data);

  await setupTestDb();
  const h = await createHarness();
  const deps = { ...h.deps, llm: createGroqClient(key, model) };
  const rows: Record<string, unknown>[] = [];

  for (const c of CASES) {
    const runs: { effective: number; cache: number; calls: number; ms: number; ok: boolean }[] = [];
    const finishes = new Set<string>();
    const limits: string[] = [];
    for (let r = 0; r < reps; r++) {
      await h.reset();
      const cg = await h.caregiver({ first_name: "Sofía" });
      const elena = await h.patient({ first_name: "Elena", last_name: "Ejemplo" });
      const raul = await h.patient({ first_name: "Raúl", last_name: "Ejemplo" });
      await h.assign(cg, elena);
      await h.medication(elena, "Enalapril", "10 mg", ["08:00"]);
      const history = await c.setup(h, { c: cg, elena, raul });
      seen.usage = {};
      seen.failure = {};
      const out = await runAssistant(deps, cg, history).catch(() => undefined);
      const u = seen.usage as {
        effective?: number;
        cache_hit?: number;
        calls?: number;
        ms?: number;
        finish?: string[];
        limits?: Record<string, string>;
      };
      const { failure } = seen;
      if (failure.limit || failure.status) limits.push(String(failure.limit ?? failure.status));
      (u.finish ?? []).forEach((f) => finishes.add(f));
      runs.push({
        effective: u.effective ?? 0,
        cache: u.cache_hit ?? 0,
        calls: u.calls ?? 0,
        ms: u.ms ?? 0,
        ok: !!out && c.ok(out),
      });
      // Sin cupo por minuto para la próxima consulta: esperar a que se renueve.
      const remaining = Number(u.limits?.["remaining-tokens"] ?? Infinity);
      if (remaining < 4000) await sleep(parseDuration(u.limits?.["reset-tokens"]) + 500);
      else if (failure.status === 429) await sleep(20_000);
    }
    // La primera corrida de cada caso es la más fría; las siguientes repiten el mismo prefijo.
    const [cold, ...warm] = runs;
    const eff = runs.map((x) => x.effective);
    const pct = (xs: typeof runs) => `${Math.round(mean(xs.map((x) => x.cache)) * 100)} %`;
    rows.push({
      caso: c.name,
      ok: `${runs.filter((x) => x.ok).length}/${runs.length}`,
      "efectivos 1ª": cold?.effective ?? 0,
      "efectivos resto": Math.round(mean(warm.map((x) => x.effective))),
      "efectivos p95": p95(eff),
      "caché 1ª": pct(runs.slice(0, 1)),
      "caché resto": pct(warm),
      llamadas: mean(runs.map((x) => x.calls)).toFixed(1),
      "ms (p95)": p95(runs.map((x) => x.ms)),
      "429/errores": limits.join(" ") || "—",
      fin: [...finishes].join(" ") || "—",
    });
    info(`${c.name}: listo`);
  }

  console.table(rows);
  await h.close();
}

await main();
