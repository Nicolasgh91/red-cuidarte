import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "../src/errors.js";
import { fitHistory, runAssistant } from "../src/services/assistant.js";
import { EMERGENCY_REPLY } from "../src/services/emergency.js";
import { LlmError, type LlmResult, type ToolCall } from "../src/services/llm.js";
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
type ChatRes = { reply: string; added: { id: string; date: string; patient_id: string }[] };
const chatJson = async (who: string, text?: string) =>
  (await (await chat(who, text)).json()) as ChatRes;
const turno = (paciente: string, fecha = "2026-10-26", desde = "08:00", hasta = "14:00") => ({
  paciente,
  fecha,
  desde,
  hasta,
});
const agregar = (...turnos: object[]) => call("agregar_turnos", { turnos });
const systemOf = (n = 0) =>
  (h.llmCalls[n]!.messages as { role: string; content: string }[])
    .filter((m) => m.role === "system")
    .map((m) => m.content);
const usageOf = (c: string) =>
  h.sql`select messages from assistant_usage where caregiver_id = ${c}`;

async function setup() {
  const c = await h.caregiver({ first_name: "Sofía" });
  const elena = await h.patient({ first_name: "Elena", last_name: "Ejemplo" });
  const raul = await h.patient({ first_name: "Raúl", last_name: "Ejemplo" });
  await h.assign(c, elena);
  await h.medication(elena, "Enalapril", "10 mg", ["08:00"]);
  return { c, elena, raul };
}

describe("asistente (F8)", () => {
  it("«trabajo lunes y miércoles de 8 a 14 con Elena» crea los turnos con una sola llamada y los devuelve para Deshacer", async () => {
    const { c, elena } = await setup();
    h.setLlm(() => toolTurn(agregar(turno("Elena"), turno("Elena", "2026-10-28"))));
    const res = await chatJson(
      c,
      "La semana que viene trabajo lunes y miércoles de 8 a 14 con Elena",
    );
    expect(res.reply).toBe("Listo, cargué 2 turnos.");
    expect(res.added.map((s) => [s.date, s.patient_id])).toEqual([
      ["2026-10-26", elena],
      ["2026-10-28", elena],
    ]);
    expect(
      await h.sql`select date::text, start_time::text, end_time::text, source from shifts order by date`,
    ).toEqual([
      { date: "2026-10-26", start_time: "08:00:00", end_time: "14:00:00", source: "assistant" },
      { date: "2026-10-28", start_time: "08:00:00", end_time: "14:00:00", source: "assistant" },
    ]);
    expect(h.llmCalls).toHaveLength(1);
  });

  it("el contexto incluye hoy, pacientes asignados, medicación, FAQ y recursos, y nada de bienestar ni de otros", async () => {
    const { c } = await setup();
    await h.sql`insert into wellbeing_records (caregiver_id, mood, energy, stress, note) values (${c}, 0, 0, 4, 'NOTA-PRIVADA-123')`;
    await chat(c);
    const system = systemOf().join("\n");
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

  it("la parte fija del contexto es idéntica para otra persona y a otra hora (para el caché de Groq)", async () => {
    const { c, raul } = await setup();
    const other = await h.caregiver({ first_name: "Marta" });
    await h.assign(other, raul);
    await chat(c);
    h.setNow(new Date("2026-10-22T20:37:00Z"));
    await chat(other);
    const [fixedA, dynA] = systemOf(0);
    const [fixedB, dynB] = systemOf(1);
    expect(fixedA).toBe(fixedB);
    // (la FAQ trae a «Elena» de ejemplo: es contenido fijo)
    expect(fixedA).not.toMatch(/Raúl|Sofía|Marta|Hora actual|2026|\d\d:\d\d/);
    expect(dynA).not.toBe(dynB);
  });

  it("el contexto usa los recursos y las preguntas frecuentes que editó el admin", async () => {
    const { c } = await setup();
    await h.sql`insert into site_content (key, value) values
      ('faq', ${h.sql.json([["¿Pregunta nueva?", "Respuesta nueva del admin."]])}),
      ('articles', ${h.sql.json([
        {
          id: "nuevo",
          cat: "Descanso",
          icon: "moon",
          title: "Recurso editado",
          desc: "d",
          body: [["p", "Texto editado por el admin."]],
        },
      ])})`;
    await chat(c);
    const system = systemOf().join("\n");
    expect(system).toContain("¿Pregunta nueva?");
    expect(system).toContain("Texto editado por el admin.");
    expect(system).not.toContain("¿Cómo cargo mis turnos?");
    expect(system).not.toContain("Manejo del estrés del cuidador");
  });

  it("valida con las mismas reglas que el alta manual y responde con lo que efectivamente pasó", async () => {
    const { c, elena } = await setup();
    await h.shift(c, elena, "2026-10-26", "10:00", "12:00");
    h.setLlm(() =>
      toolTurn(
        agregar(
          turno("Elena"), // se superpone
          turno("Raúl", "2026-10-27"), // no asignado
          turno("Elena", "27/10"), // formato
          turno("Elena", "2026-10-27", "08:00", "08:00"), // 0 minutos
          turno("Elena", "2026-10-27", "22:00", "06:00"), // ok (cruza medianoche)
          turno("Elena", "2026-10-28", "03:00", "07:00"), // pisa el nocturno
        ),
      ),
    );
    const res = await chatJson(c);
    expect(res.added).toHaveLength(1);
    const lines = res.reply.split("\n");
    expect(lines[0]).toBe("Cargué 1 de 6 turnos.");
    expect(lines.slice(1)).toHaveLength(5);
    expect(lines[1]).toContain("Se superpone");
    expect(lines[2]).toContain("no es un paciente asignado");
    expect(await h.sql`select 1 from shifts`).toHaveLength(2);
    expect(h.llmCalls).toHaveLength(1);
  });

  it("listar_turnos responde sin otra llamada y solo con los turnos del propio cuidador", async () => {
    const { c, elena } = await setup();
    const otro = await h.caregiver();
    await h.assign(otro, elena);
    await h.shift(c, elena, "2026-10-21", "08:00", "14:00");
    await h.shift(otro, elena, "2026-10-21", "14:00", "20:00");
    h.setLlm(() => toolTurn(call("listar_turnos", { desde: "2026-10-19", hasta: "2026-10-25" })));
    const res = await chatJson(c, "¿Qué turnos tengo esta semana?");
    expect(res.reply).toBe(
      "Tus turnos entre el lunes 19 de octubre y el domingo 25 de octubre:\n- Miércoles, 21 de octubre: de 08:00 a 14:00 con Elena Ejemplo",
    );
    expect(h.llmCalls).toHaveLength(1);
    h.setLlm(() => toolTurn(call("listar_turnos", { desde: "2026-10-26", hasta: "2026-10-26" })));
    expect((await chatJson(c)).reply).toBe("No tenés turnos el lunes 26 de octubre.");
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
    h.setLlm(() => toolTurn(agregar(turno("Elena", "2026-10-29", "08:00", "10:00"))));
    const { added } = await chatJson(c);
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
    expect(await usageOf(c)).toEqual([{ messages: 20 }]);
    expect((await chat(other)).status).toBe(200); // el límite es por usuario
    h.setNow(new Date("2026-10-22T15:00:00Z")); // al día siguiente se renueva
    expect((await chat(c)).status).toBe(200);
  });

  it("si Groq devuelve límite alcanzado: mensaje claro y no se descuenta del cupo", async () => {
    const { c } = await setup();
    h.setLlm(() => {
      throw new LlmError("Groq respondió 429", 429);
    });
    const r = await chat(c);
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: { code: string; message: string } }).error).toMatchObject({
      code: "assistant_busy",
      message: expect.stringContaining("Probá de nuevo"),
    });
    expect(await usageOf(c)).toEqual([{ messages: 0 }]);
  });

  it("si Groq rechaza la configuración (key inválida): 503, no «muchas consultas», y no se descuenta", async () => {
    const { c } = await setup();
    h.setLlm(() => {
      throw new LlmError("Groq respondió 401: Invalid API Key", 401, "invalid_api_key");
    });
    const r = await chat(c);
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      "assistant_unavailable",
    );
    expect(await usageOf(c)).toEqual([{ messages: 0 }]);
  });

  it("si Groq tarda más que el plazo: «ocupado» y no se descuenta", async () => {
    const { c } = await setup();
    h.setLlm(() => new Promise((r) => setTimeout(() => r(say("tarde")), 300)));
    const e = await runAssistant(h.deps, c, [{ role: "user", content: "hola" }], 50).catch(
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(HttpError);
    expect(e).toMatchObject({ status: 429, code: "assistant_busy" });
    expect(await usageOf(c)).toEqual([{ messages: 0 }]);
  });

  it("corta los bucles de herramientas", async () => {
    const { c } = await setup();
    h.setLlm(() => toolTurn(call("listar_turnos", { desde: "ayer", hasta: "hoy" })));
    const res = await chatJson(c);
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

describe("asistente: paciente de cada turno", () => {
  it("sin paciente y con más de uno asignado: error y ningún turno", async () => {
    const { c, raul } = await setup();
    await h.assign(c, raul);
    h.setLlm(() => toolTurn(agregar(turno(""))));
    const res = await chatJson(c);
    expect(res.added).toEqual([]);
    expect(res.reply).toContain("Falta el paciente");
    expect(await h.sql`select 1 from shifts`).toHaveLength(0);
  });

  it("sin paciente y con uno solo asignado: es ese", async () => {
    const { c, elena } = await setup();
    h.setLlm(() => toolTurn(agregar(turno(""))));
    expect((await chatJson(c)).added.map((s) => s.patient_id)).toEqual([elena]);
  });

  it("«Raul» sin tilde es Raúl", async () => {
    const { c, raul } = await setup();
    await h.assign(c, raul);
    h.setLlm(() => toolTurn(agregar(turno("raul ejemplo"))));
    expect((await chatJson(c)).added.map((s) => s.patient_id)).toEqual([raul]);
  });

  it("un nombre que coincide con dos pacientes: error", async () => {
    const { c } = await setup();
    await h.assign(c, await h.patient({ first_name: "Elena", last_name: "Otra" }));
    h.setLlm(() => toolTurn(agregar(turno("Elena"))));
    const res = await chatJson(c);
    expect(res.added).toEqual([]);
    expect(res.reply).toContain("hay más de un paciente con ese nombre");
  });
});

describe("asistente: urgencias", () => {
  it("una urgencia activa se responde sin Groq y sin gastar el cupo", async () => {
    const { c } = await setup();
    const res = await chatJson(c, "Mi mamá no respira, ¿qué hago?");
    expect(res).toEqual({ reply: EMERGENCY_REPLY, added: [] });
    expect(res.reply).toContain("SAME 107");
    expect(h.llmCalls).toHaveLength(0);
    expect(await usageOf(c)).toEqual([]);
  });

  it("responde aunque el cupo esté agotado y Groq caído", async () => {
    const { c } = await setup();
    await h.sql`insert into assistant_usage (caregiver_id, date, messages) values (${c}, '2026-10-21', 20)`;
    h.setLlm(() => {
      throw new LlmError("Groq respondió 429", 429);
    });
    const r = await chat(c, "Se cayó y se golpeó la cabeza");
    expect(r.status).toBe(200);
    expect(((await r.json()) as ChatRes).reply).toBe(EMERGENCY_REPLY);
  });

  it("una pregunta hipotética sigue por Groq", async () => {
    const { c } = await setup();
    await chat(c, "¿Qué hago si se desmaya?");
    expect(h.llmCalls).toHaveLength(1);
  });
});

describe("asistente: integridad de los turnos", () => {
  it("después de escribir no hay otra ronda con el modelo: los turnos se crean una sola vez", async () => {
    const { c } = await setup();
    h.setLlm(() => toolTurn(agregar(turno("Elena"))));
    const res = await chatJson(c);
    expect(res.added).toHaveLength(1);
    expect(h.llmCalls).toHaveLength(1);
    expect(await h.sql`select 1 from shifts`).toHaveLength(1);
  });

  it("herramientas mezcladas: se cargan los turnos y se avisa la consulta que falló", async () => {
    const { c } = await setup();
    h.setLlm(() =>
      toolTurn(call("listar_turnos", { desde: "x", hasta: "y" }, "a"), {
        ...agregar(turno("Elena")),
        id: "b",
      }),
    );
    const res = await chatJson(c);
    expect(res.added).toHaveLength(1);
    expect(res.reply).toBe(
      "Listo, cargué 1 turno.\nNo pude consultar tus turnos. Preguntame de nuevo.",
    );
    expect(h.llmCalls).toHaveLength(1);
  });

  it("éxito parcial: lo que se pudo cargar queda cargado y en `added`", async () => {
    const { c, elena } = await setup();
    await h.shift(c, elena, "2026-10-26", "10:00", "12:00");
    h.setLlm(() => toolTurn(agregar(turno("Elena"), turno("Elena", "2026-10-27"))));
    const res = await chatJson(c);
    expect(res.added.map((s) => s.date)).toEqual(["2026-10-27"]);
    expect(res.reply.split("\n")[0]).toBe("Cargué 1 de 2 turnos.");
  });

  it("turnos repetidos en el mismo pedido se crean una vez, aunque vengan en dos llamadas", async () => {
    const { c } = await setup();
    h.setLlm(() =>
      toolTurn(agregar(turno("Elena"), turno("elena")), { ...agregar(turno("Elena")), id: "b" }),
    );
    const res = await chatJson(c);
    expect(res.added).toHaveLength(1);
    expect(res.reply).toBe("Listo, cargué 1 turno.");
  });

  it("el mismo pedido dos veces: «ya estaba cargado», sin turno nuevo ni nada para Deshacer", async () => {
    const { c } = await setup();
    h.setLlm(() => toolTurn(agregar(turno("Elena"))));
    await chatJson(c);
    const again = await chatJson(c);
    expect(again.added).toEqual([]);
    expect(again.reply).toBe(
      "El lunes 26 de octubre de 08:00 a 14:00 con Elena Ejemplo ya estaba cargado.",
    );
    expect(await h.sql`select 1 from shifts`).toHaveLength(1);
  });

  it("dos pedidos iguales al mismo tiempo dejan un solo turno", async () => {
    const { c } = await setup();
    h.setLlm(() => toolTurn(agregar(turno("Elena"))));
    const [a, b] = await Promise.all([chatJson(c), chatJson(c)]);
    expect(a.added.length + b.added.length).toBe(1);
    expect(await h.sql`select 1 from shifts`).toHaveLength(1);
  });

  it("argumentos inválidos sin escritura: vuelve al modelo para que corrija", async () => {
    const { c } = await setup();
    h.setLlm((n) =>
      n === 1 ? toolTurn(call("agregar_turnos", { turnos: "lunes" })) : say("¿Qué días trabajás?"),
    );
    const res = await chatJson(c);
    expect(res.reply).toBe("¿Qué días trabajás?");
    expect(h.llmCalls).toHaveLength(2);
    const sent = h.llmCalls[1]!.messages.at(-1) as { role: string; content: string };
    expect(sent.role).toBe("tool");
    expect(JSON.parse(sent.content)).toEqual({ error: "Falta la lista de turnos." });
  });
});

describe("asistente: presupuesto del historial", () => {
  const est = (s: string) => Math.ceil(s.length / 3);
  const total = (h: { content: string }[]) => h.reduce((n, m) => n + est(m.content), 0);
  type Turn = { role: "user" | "assistant"; content: string };
  const conv = (lens: number[]): Turn[] =>
    lens.map((n, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `${i}:`.padEnd(n, "x"),
    }));

  it("nunca pasa el presupuesto, con historiales largos al azar", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 200; k++) {
      const lens = Array.from({ length: 1 + 2 * Math.floor(rand() * 7) }, () =>
        Math.ceil(rand() * 2000),
      );
      const out = fitHistory(conv(lens));
      expect(total(out)).toBeLessThanOrEqual(1500);
      expect(out.at(-1)!.content).toHaveLength(lens.at(-1)!); // el último entra entero
    }
  });

  it("la respuesta anterior del asistente se conserva recortada desde el final", () => {
    const hist = conv([2000, 2000, 2000]);
    // Con mensajes de hasta 2.000 caracteres entran los dos; una respuesta más larga se recorta.
    hist[1]!.content = "x".repeat(3000) + " ¿Con qué paciente?";
    const out = fitHistory(hist);
    expect(out).toHaveLength(2);
    expect(out[0]!.content.startsWith("…")).toBe(true);
    expect(out[0]!.content.endsWith("¿Con qué paciente?")).toBe(true);
    expect(total(out)).toBeLessThanOrEqual(1500);
  });

  it("entran los tres últimos intercambios completos si caben, y lo anterior solo si sobra", () => {
    expect(fitHistory(conv(Array(7).fill(100)))).toHaveLength(7);
    const out = fitHistory(conv([2000, 2000, 500, 500, 500, 500, 500, 500, 500]));
    expect(out.map((m) => m.content.split(":")[0])).toEqual(["2", "3", "4", "5", "6", "7", "8"]);
  });
});
