import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { errorMessage } from "../api/errors";
import { Icon } from "./icons";

/** Enlace "‹ Volver" a una ruta fija. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="back" to={to}>
      <Icon name="chevL" /> {children}
    </Link>
  );
}

/** Botón "‹ Volver" que vuelve a la pantalla anterior (o al inicio si no hay). */
export function GoBack({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  return (
    <button
      className="back"
      onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback))}
    >
      <Icon name="chevL" /> Volver
    </button>
  );
}

export function PageHead({
  title,
  sub,
  hello,
}: {
  title: string;
  sub?: ReactNode;
  hello?: string;
}) {
  return (
    <div className="head">
      {hello && <p className="hello">{hello}</p>}
      <h1>{title}</h1>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <div className="card record">
      <span className="vals">{children}</span>
    </div>
  );
}

/** Estado de una consulta: cargando, error con "Reintentar", o el contenido. */
export function Async<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending)
    return (
      <p className="optional" role="status">
        Cargando…
      </p>
    );
  if (query.isError)
    return (
      <div className="card record" role="alert">
        <span className="vals">{errorMessage(query.error)}</span>
        <div className="btn-row">
          <button className="ghost" onClick={() => void query.refetch()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  return <>{children(query.data)}</>;
}

/** Campo de formulario con etiqueta, pista y error. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="hint">{hint}</p>}
      {children}
      {error && (
        <p className="err" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Texto con **negritas** y listas simples (las respuestas del asistente), sin HTML crudo. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    const items = list;
    blocks.push(
      <ul key={`ul${blocks.length}`}>
        {items.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of text.split("\n")) {
    const m = /^\s*(?:[-•*]|\d+\.)\s+(.*)$/.exec(line);
    if (m) list.push(m[1] ?? "");
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

function inline(s: string): ReactNode[] {
  return s
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}
