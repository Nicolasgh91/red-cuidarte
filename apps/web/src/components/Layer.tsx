import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { PAUSES } from "../lib/pauses";
import { pad } from "../lib/dates";
import { SAME_NUMBER } from "../lib/labels";
import { Icon, UrgentIcon } from "./icons";
import { useToast } from "./Toasts";

type Layer = { kind: "player"; id: string } | { kind: "urgent" } | null;

interface LayerApi {
  openPlayer(id: string): void;
  openUrgent(): void;
  close(): void;
}
const LayerContext = createContext<LayerApi | null>(null);

export function useLayer(): LayerApi {
  const ctx = useContext(LayerContext);
  if (!ctx) throw new Error("useLayer fuera de LayerProvider");
  return ctx;
}

/** Capa modal sobre la app: reproductor de pausas guiadas y pantalla de urgencia. */
export function LayerProvider({ children }: { children: ReactNode }) {
  const [layer, setLayer] = useState<Layer>(null);
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((l: NonNullable<Layer>) => {
    opener.current ??= document.activeElement as HTMLElement | null;
    setLayer(l);
  }, []);
  const close = useCallback(() => {
    setLayer(null);
    const el = opener.current;
    opener.current = null;
    if (el && typeof el.focus === "function") queueMicrotask(() => el.focus());
  }, []);

  useEffect(() => {
    if (!layer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [layer, close]);

  const api = useMemo<LayerApi>(
    () => ({
      openPlayer: (id) => {
        if (PAUSES[id]) open({ kind: "player", id });
      },
      openUrgent: () => open({ kind: "urgent" }),
      close,
    }),
    [open, close],
  );

  return (
    <LayerContext.Provider value={api}>
      {children}
      {layer?.kind === "player" && <PauseDialog key={layer.id} id={layer.id} onClose={close} />}
      {layer?.kind === "urgent" && <UrgentDialog onClose={close} />}
    </LayerContext.Provider>
  );
}

function PauseDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const p = PAUSES[id]!;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const orbRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const finished = elapsed >= p.secs;

  useEffect(() => {
    toggleRef.current?.focus();
  }, []);

  // Reloj: suma el tiempo real transcurrido mientras está en marcha.
  useEffect(() => {
    if (!running || finished) return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setElapsed((e) => Math.min(p.secs, e + dt));
    }, 200);
    return () => clearInterval(t);
  }, [running, finished, p.secs]);

  // Respiración: 4 s inhalar, 2 s sostener, 6 s exhalar.
  const cycle = elapsed % 12;
  const phase = cycle < 4 ? "in" : cycle < 6 ? "hold" : "out";
  useEffect(() => {
    const orb = orbRef.current;
    if (!orb || !p.breath) return;
    if (finished) {
      orb.style.transitionDuration = "";
      orb.style.transform = "scale(.85)";
    } else if (running && phase !== "hold") {
      void orb.offsetWidth; // fuerza el cálculo de estilos para que la transición arranque
      orb.style.transitionDuration = phase === "in" ? "4s" : "6s";
      orb.style.transform = phase === "in" ? "scale(1)" : "scale(.6)";
    }
  }, [phase, running, finished, p.breath]);

  let text = "";
  if (p.breath) {
    text =
      phase === "in"
        ? "Inhalá por la nariz…"
        : phase === "hold"
          ? "Sostené un momento…"
          : "Soltá el aire despacio por la boca…";
  } else if (p.steps) {
    const per = p.secs / p.steps.length;
    text = p.steps[Math.min(p.steps.length - 1, Math.floor(elapsed / per))] ?? "";
  }
  const left = Math.ceil(p.secs - elapsed);
  const orbStyle: CSSProperties | undefined =
    finished && !p.breath ? { transform: "scale(.85)" } : undefined;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pl-title">
      <div className="dialog">
        <button className="close" onClick={onClose} aria-label="Cerrar">
          <Icon name="x" />
        </button>
        <h2 id="pl-title">{p.title}</h2>
        <div className="stage">
          <div
            ref={orbRef}
            className={`orb${p.breath || finished ? "" : " pulse"}`}
            style={orbStyle}
          />
        </div>
        <p className="step" aria-live="polite">
          {finished ? "Terminaste. Bien hecho." : running ? text : "En pausa"}
        </p>
        <p className="timer">
          {finished
            ? "Tomate un momento antes de volver."
            : `${Math.floor(left / 60)}:${pad(left % 60)} restantes`}
        </p>
        <div className="bar">
          <i style={{ width: `${(Math.min(elapsed, p.secs) / p.secs) * 100}%` }} />
        </div>
        <div className="btn-row">
          {finished ? (
            <>
              <Link className="primary-btn" style={{ flex: 1 }} to="/bienestar" onClick={onClose}>
                Registrar cómo estoy
              </Link>
              <button className="ghost" onClick={onClose}>
                Cerrar
              </button>
            </>
          ) : (
            <>
              <button
                ref={toggleRef}
                className="primary-btn"
                style={{ flex: 1 }}
                onClick={() => setRunning((r) => !r)}
              >
                {running ? "Pausar" : "Reanudar"}
              </button>
              <button className="ghost" onClick={onClose}>
                Terminar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UrgentDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const numRef = useRef<HTMLParagraphElement>(null);
  const n = SAME_NUMBER;

  async function copy() {
    try {
      await navigator.clipboard.writeText(n);
      toast("Número copiado.");
    } catch {
      const el = numRef.current;
      const sel = window.getSelection();
      if (el && sel) {
        const r = document.createRange();
        r.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      toast("Número seleccionado. Copialo desde el menú.");
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="ur-title">
      <div className="dialog">
        <button className="close" onClick={onClose} aria-label="Cerrar">
          <Icon name="x" />
        </button>
        <h2 id="ur-title">Urgencia</h2>
        <p style={{ margin: 0 }}>Llamá al servicio de emergencias médicas:</p>
        <p className="bignum" ref={numRef}>
          {n}
        </p>
        <div className="btn-row">
          <a
            className="danger"
            style={{ textDecoration: "none" }}
            href={`tel:${n.replace(/[^\d+]/g, "")}`}
          >
            Llamar al {n}
          </a>
          <button className="ghost" onClick={() => void copy()}>
            Copiar número
          </button>
        </div>
        <p className="note" style={{ fontSize: ".92rem" }}>
          Si el botón no abre el teléfono, marcá el número a mano.
        </p>
      </div>
    </div>
  );
}

export function UrgentButton() {
  const { openUrgent } = useLayer();
  return (
    <button className="urgent" onClick={openUrgent}>
      <UrgentIcon />
      <div>
        <strong>Urgencia</strong>
        <span>Llamar al SAME {SAME_NUMBER}</span>
      </div>
    </button>
  );
}
