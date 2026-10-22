import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LlmRateLimitError, type LlmResult, type ToolCall } from "../src/services/llm.js";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

const call = (name: string, args: object, id = "call_1"): ToolCall => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});
const toolTurn = (...calls: ToolCall[]): LlmResult => ({ content: null, tool_calls: calls });
const say = (content: string): LlmResult => ({ content, tool_calls: [] });
const chat = (who: string, text = "hola") =>
  h.req("/assistant/chat", { as: who, json: { messages: [{ role: "user", content: text }] } });

async function setup() {
  const c = await h.caregiver({ first_name: "Sofía" });
  const elena = await h.patient({ first_name: "Elena", last_name: "Ejemplo" });
  const raul = await h.patient({ first_name: "Raúl", last_name: "Ejemplo" });
  await h.assign(c, elena);
  await h.medication(elena, "Enalapril", "10 mg", ["08:00"]);
  return { c, elena, raul };
}

describe("asistente (F8)", () => {
  it("«trabajo lunes y miércoles de 8 a 14 con Elena» crea los turnos correctos y los devuelve para Deshacer", async () => {
    const { c, elena } = await setup();
    h.setLlm((n) =>
      n === 1
        ? toolTurn(
            call("agregar_turnos", {
              turnos: [
                { paciente: "Elena", fecha: "2026-10-26", desde: "08:00", hasta: "14:00" },
                { paciente: "Elena", fecha: "2026-10-28", desde: "08:00", hasta: "14:00" },
              ],
            }),
          )
        : say("Listo: cargué lunes 26 y miércoles 28, de 8 a 14, con Elena."),
    );
    const res = (await (
      await chat(c, "La semana que viene trabajo lunes y miércoles de 8 a 14 con Elena")
    ).json()) as {
      reply: string;
      added: { id: string; date: string; patient_id: string; source: string }[];
    };
    expect(res.reply).toContain("cargué lunes 26");
    expect(res.added.map((s) => [s.date, s.patient_id, s.source])).toEqual([
      ["2026-10-26", elena, "assistant"],
      ["2026-10-28", elena, "assistant"],
    ]);
    expect(
      await h.sql`select date::text, start_time::text, end_time::text, source from shifts order by date`,
    ).toEqual([
      { date: "2026-10-26", start_time: "08:00:00", end_time: "14:00:00", source: "assistant" },
      { date: "2026-10-28", start_time: "08:00:00", end_time: "14:00:00", source: "assistant" },
    ]);
    // el resultado de la herramienta vuelve al modelo
    const last = h.llmCalls.at(-1)!.messages as { role: string; content: string }[];
    expect(last.at(-1)!.role).toBe("tool");
    expect(JSON.parse(last.at(-1)!.content).agregados).toHaveLength(2);
  });

  it("el contexto incluye hoy, pacientes asignados, medicación, FAQ y recursos, y nada de bienestar ni de otros", async () => {
    const { c } = await setup();
    await h.sql`insert into wellbeing_records (caregiver_id, mood, energy, stress, note) values (${c}, 0, 0, 4, 'NOTA-PRIVADA-123')`;
    await chat(c);
    const system = (h.llmCalls[0]!.messages[0] as { content: string }).content;
    expect(system).toContain("Miércoles, 21 de octubre de 2026 (2026-10-21)");
    expect(system).toContain("Hora actual: 12:00");
    expect(system).toContain("Pacientes asignados: Elena Ejemplo");
    expect(system).toContain("Enalapril 10 mg a las 08:00");
    expect(system).toContain("¿Cómo cargo mis turnos?");
    expect(system).toContain("Manejo del estrés del cuidador");
    expect(system).toContain("No des diagnósticos");
    expect(system).not.toContain("Raúl");
    expect(JSON.stringify(h.llmCalls)).not.toContain("NOTA-PRIVADA-123");
  });

  it("valida con las mismas reglas que el alta manual: superposición, paciente no asignado y formato", async () => {
    const { c, elena } = await setup();
    await h.shift(c, elena, "2026-10-26", "10:00", "12:00");
    let toolResult: { agregados: unknown[]; errores: string[] } | undefined;
    h.setLlm((n, input) => {
      if (n === 1) {
        return toolTurn(
          call("agregar_turnos", {
            turnos: [
              { paciente: "Elena", fecha: "2026-10-26", desde: "08:00", hasta: "14:00" }, // se superpone
              { paciente: "Raúl", fecha: "2026-10-27", desde: "08:00", hasta: "14:00" }, // no asignado
              { paciente: "Elena", fecha: "27/10", desde: "08:00", hasta: "14:00" }, // formato
              { paciente: "Elena", fecha: "2026-10-27", desde: "08:00", hasta: "08:00" }, // 0 minutos
              { paciente: "Elena", fecha: "2026-10-27", desde: "22:00", hasta: "06:00" }, // ok (cruza medianoche)
              { paciente: "Elena", fecha: "2026-10-28", desde: "03:00", hasta: "07:00" }, // pisa el nocturno
            ],
          }),
        );
      }
      toolResult = JSON.parse((input.messages.at(-1) as { content: string }).content);
      return say("Cargué uno y hubo errores.");
    });
    const res = (await (await chat(c)).json()) as { added: unknown[] };
    expect(res.added).toHaveLength(1);
    expect(toolResult!.agregados).toEqual([
      { fecha: "2026-10-27", desde: "22:00", hasta: "06:00", paciente: "Elena Ejemplo" },
    ]);
    expect(toolResult!.errores).toHaveLength(5);
    expect(toolResult!.errores[0]).toContain("Se superpone");
    expect(toolResult!.errores[1]).toContain("no es un paciente asignado");
    expect(await h.sql`select 1 from shifts`).toHaveLength(2);
  });

  it("listar_turnos devuelve solo los turnos del propio cuidador", async () => {
    const { c, elena } = await setup();
    const otro = await h.caregiver();
    await h.assign(otro, elena);
    await h.shift(c, elena, "2026-10-21", "08:00", "14:00");
    await h.shift(otro, elena, "2026-10-21", "14:00", "20:00");
    let out: { fecha: string; desde: string; paciente: string }[] = [];
    h.setLlm((n, input) => {
      if (n === 1)
        return toolTurn(call("listar_turnos", { desde: "2026-10-19", hasta: "2026-10-25" }));
      out = JSON.parse((input.messages.at(-1) as { content: string }).content);
      return say("Tenés un turno.");
    });
    await chat(c, "¿Qué turnos tengo esta semana?");
    expect(out).toEqual([
      {
        fecha: "2026-10-21",
        dia: "Miércoles, 21 de octubre",
        desde: "08:00",
        hasta: "14:00",
        paciente: "Elena Ejemplo",
      },
    ]);
  });

  it("Deshacer borra solo turnos propios cargados por el asistente", async () => {
    const { c, elena } = await setup();
    const otro = await h.caregiver();
    await h.assign(otro, elena);
    const manual = await h.shift(c, elena, "2026-10-26", "08:00", "10:00");
    const ofOtro = (
      await h.sql<
        { id: string }[]
      >`insert into shifts (caregiver_id, patient_id, date, start_time, end_time, source) values (${otro}, ${elena}, '2026-10-27', '08:00', '10:00', 'assistant') returning id`
    )[0]!.id;
    h.setLlm((n) =>
      n === 1
        ? toolTurn(
            call("agregar_turnos", {
              turnos: [{ paciente: "Elena", fecha: "2026-10-29", desde: "08:00", hasta: "10:00" }],
            }),
          )
        : say("Listo."),
    );
    const { added } = (await (await chat(c)).json()) as { added: { id: string }[] };
    const r = await h.req("/assistant/undo", {
      as: c,
      json: { shift_ids: [added[0]!.id, manual, ofOtro] },
    });
    expect(await r.json()).toEqual({ deleted: 1 });
    expect(await h.sql`select 1 from shifts`).toHaveLength(2);
  });

  it("límite de 20 mensajes por día por usuario, guardado en la base", async () => {
    const { c } = await setup();
    const other = await h.caregiver();
    for (let i = 0; i < 20; i++) expect((await chat(c)).status).toBe(200);
    const r = await chat(c);
    expect(r.status).toBe(429);
    const err = ((await r.json()) as { error: { code: string; message: string } }).error;
    expect(err.code).toBe("assistant_limit");
    expect(err.message).toContain("20 mensajes");
    expect(await h.sql`select messages from assistant_usage where caregiver_id = ${c}`).toEqual([
      { messages: 20 },
    ]);
    expect((await chat(other)).status).toBe(200); // el límite es por usuario
    h.setNow(new Date("2026-10-22T15:00:00Z")); // al día siguiente se renueva
    expect((await chat(c)).status).toBe(200);
  });

  it("si Groq devuelve límite alcanzado: mensaje claro y no se descuenta del cupo", async () => {
    const { c } = await setup();
    h.setLlm(() => {
      throw new LlmRateLimitError("429");
    });
    const r = await chat(c);
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: { code: string; message: string } }).error).toMatchObject({
      code: "assistant_busy",
      message: expect.stringContaining("Probá de nuevo"),
    });
    expect(await h.sql`select messages from assistant_usage where caregiver_id = ${c}`).toEqual([
      { messages: 0 },
    ]);
  });

  it("corta los bucles de herramientas", async () => {
    const { c } = await setup();
    h.setLlm(() => toolTurn(call("listar_turnos", { desde: "2026-10-19", hasta: "2026-10-25" })));
    const res = (await (await chat(c)).json()) as { reply: string };
    expect(res.reply).toContain("no pude terminar");
    expect(h.llmCalls).toHaveLength(4);
  });

  it("valida el pedido y sirve solo a cuidadores", async () => {
    const { c } = await setup();
    const a = await h.admin();
    expect((await h.req("/assistant/chat", { as: c, json: { messages: [] } })).status).toBe(400);
    expect(
      (
        await h.req("/assistant/chat", {
          as: c,
          json: { messages: [{ role: "assistant", content: "x" }] },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await h.req("/assistant/chat", {
          as: c,
          json: { messages: [{ role: "user", content: "x".repeat(2001) }] },
        })
      ).status,
    ).toBe(400);
    expect((await chat(a)).status).toBe(403);
    expect(h.llmCalls).toHaveLength(0);
  });
});
