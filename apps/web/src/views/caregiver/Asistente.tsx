import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link } from "react-router";
import { ApiError, errorMessage } from "../../api/errors";
import { useAssistantChat, useAssistantUndo } from "../../api/queries/assistant";
import type { ChatTurn } from "../../api/queries/assistant";
import { useMe, useMyPatients } from "../../api/queries/me";
import type { Patient, Shift } from "../../api/types";
import { Markdown } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { ARTICLES, FAQ } from "../../content";
import { hrsLabel, listJoin, relDay } from "../../lib/dates";

const SUGGEST = [
  "La semana que viene trabajo lunes y miércoles de 8 a 14 con Elena",
  "¿Qué turnos tengo esta semana?",
  "¿Cómo ayudo a Raúl a pararse sin lastimarme la espalda?",
  "Estoy agotada, ¿qué puedo hacer hoy?",
];

type Item =
  | { type: "user"; text: string }
  | { type: "bot"; text: string }
  | { type: "err"; text: string }
  | { type: "card"; shifts: Shift[]; undone: boolean };

const pName = (patients: Patient[], id: string): string => {
  const p = patients.find((x) => x.id === id);
  return p ? `${p.first_name} ${p.last_name}`.trim() : "Paciente";
};

function CardMsg({
  item,
  patients,
  onUndo,
  busy,
}: {
  item: Extract<Item, { type: "card" }>;
  patients: Patient[];
  onUndo: () => void;
  busy: boolean;
}) {
  const n = item.shifts.length;
  return (
    <div className="msg card-msg">
      <b style={{ color: "var(--ink)" }}>
        {item.undone
          ? "Deshiciste estos turnos"
          : `Agregué ${n} ${n === 1 ? "turno" : "turnos"} a tu calendario`}
      </b>
      <ul>
        {item.shifts.map((s) => (
          <li key={s.id}>
            {relDay(s.date)} · {hrsLabel(s)} · {pName(patients, s.patient_id)}
          </li>
        ))}
      </ul>
      {!item.undone && (
        <div className="btn-row">
          <Link className="ghost" to="/turnos">
            Ver en Turnos
          </Link>
          <button className="ghost" onClick={onUndo} disabled={busy}>
            Deshacer
          </button>
        </div>
      )}
    </div>
  );
}

export function Asistente() {
  const me = useMe();
  const patientsQ = useMyPatients();
  const chat = useAssistantChat();
  const undo = useAssistantUndo();
  const { toast } = useToast();
  const patients = patientsQ.data ?? [];
  const name = me.data?.profile?.first_name;

  const [items, setItems] = useState<Item[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const msgsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = chat.isPending;

  useEffect(() => {
    const box = msgsRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [items, busy]);

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || busy) return;
    const sent: ChatTurn[] = [...turns, { role: "user", content }];
    setItems((l) => [...l, { type: "user", text: content }]);
    setTurns(sent);
    setText("");
    try {
      const r = await chat.mutateAsync(sent);
      setTurns([...sent, { role: "assistant", content: r.reply }]);
      setItems((l) => [
        ...l,
        { type: "bot", text: r.reply },
        ...(r.added.length ? [{ type: "card" as const, shifts: r.added, undone: false }] : []),
      ]);
    } catch (e) {
      // 429 assistant_limit / assistant_busy y demás: se muestra el mensaje del servidor.
      setTurns(turns);
      setItems((l) => [
        ...l,
        { type: "err", text: e instanceof ApiError ? e.message : errorMessage(e) },
      ]);
    }
    inputRef.current?.focus();
  }

  async function undoCard(index: number) {
    const it = items[index];
    if (!it || it.type !== "card" || it.undone) return;
    try {
      await undo.mutateAsync(it.shifts.map((s) => s.id));
      setItems((l) =>
        l.map((x, i) => (i === index && x.type === "card" ? { ...x, undone: true } : x)),
      );
      setTurns((t) => [
        ...t,
        {
          role: "user",
          content: "(Deshice los turnos que agregaste recién. Ya no están cargados.)",
        },
        { role: "assistant", content: "Entendido, esos turnos ya no están cargados." },
      ]);
      toast("Turnos deshechos.");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(text);
    }
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }
  function clear() {
    setItems([]);
    setTurns([]);
  }

  return (
    <div className="page wide">
      <div className="head">
        <h1>Asistente</h1>
        <p className="sub">Preguntá lo que necesites o contale tus turnos.</p>
      </div>
      <div className="chat-grid">
        <section className="card chat" aria-label="Conversación con el asistente">
          <div className="chat-head">
            <span>La conversación no se guarda.</span>
            <button
              className="ghost"
              style={{ padding: "6px 12px" }}
              onClick={clear}
              disabled={busy}
            >
              Nueva conversación
            </button>
          </div>
          <div className="msgs" id="msgs" ref={msgsRef} aria-live="polite">
            {items.length === 0 && (
              <div className="msg bot">
                <p>
                  Hola{name ? `, ${name}` : ""}. Puedo responder dudas sobre el cuidado y tus
                  recursos, decirte tus turnos o cargarlos en tu calendario si me los contás.
                </p>
              </div>
            )}
            {items.map((m, i) =>
              m.type === "user" ? (
                <div className="msg user" key={i}>
                  {m.text}
                </div>
              ) : m.type === "err" ? (
                <div className="msg err-msg" key={i} role="alert">
                  {m.text}
                </div>
              ) : m.type === "card" ? (
                <CardMsg
                  key={i}
                  item={m}
                  patients={patients}
                  busy={undo.isPending}
                  onUndo={() => void undoCard(i)}
                />
              ) : (
                <div className="msg bot" key={i}>
                  <Markdown text={m.text} />
                </div>
              ),
            )}
            {busy && <div className="msg bot pending">Pensando…</div>}
          </div>
          <form className="composer" onSubmit={onSubmit} noValidate>
            {items.length === 0 && (
              <div className="chips">
                {SUGGEST.map((s) => (
                  <button
                    type="button"
                    className="chip"
                    key={s}
                    onClick={() => {
                      setText(s);
                      inputRef.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <textarea
              id="chat-in"
              ref={inputRef}
              placeholder="Escribí tu mensaje…"
              aria-label="Mensaje"
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
            />
            <div className="row-between">
              <span className="optional">Enter envía · Shift+Enter hace un salto de línea</span>
              <button className="primary-btn sm" type="submit" disabled={busy}>
                <Icon name="send" /> Enviar
              </button>
            </div>
          </form>
        </section>
        <aside className="card sources" aria-label="Con qué se alimenta el asistente">
          <h3>Con qué se alimenta</h3>
          <ul>
            <li>Los {ARTICLES.length} recursos de Cuidarte mientras cuidás.</li>
            <li>{FAQ.length} preguntas frecuentes, revisadas por Red Cuidar.</li>
            <li>
              Tus turnos y tus pacientes:{" "}
              {listJoin(patients.map((p) => `${p.first_name} ${p.last_name}`.trim())) || "ninguno"}.
            </li>
            <li>La medicación cargada en la ficha de cada paciente.</li>
          </ul>
          <p className="optional" style={{ margin: 0 }}>
            No busca en internet, no ve tu registro de bienestar y no da diagnósticos. Solo puede
            consultar y agregar turnos tuyos.
          </p>
          <details>
            <summary>Ver preguntas frecuentes</summary>
            <div className="faq">
              {FAQ.map((f) => (
                <div key={f[0]}>
                  <b>{f[0]}</b>
                  {f[1]}
                </div>
              ))}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
