import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import type { Role } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { ROLES } from "../lib/labels";
import { THEMES, applyTheme, getStoredTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { Icon } from "./icons";

/** Menú "Mi cuenta": datos, enlaces, tema (por dispositivo) y cerrar sesión. */
export function AccountMenu({ role, name }: { role: Role; name: string }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Cierra al navegar, al tocar afuera o con Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="acct" ref={ref}>
      <button
        className="acct-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="user" />
        <span>Mi cuenta</span>
      </button>
      <div className="menu" hidden={!open}>
        <div className="who">
          <b>{name || "Sin nombre"}</b>
          <span>{ROLES[role]}</span>
        </div>
        {role === "caregiver" && (
          <>
            <Link to="/perfil">Mi perfil</Link>
            <Link to="/recordatorios">Recordatorios</Link>
          </>
        )}
        <Link to="/acerca">Acerca de Red Cuidar</Link>
        <Link to="/terminos">Términos y privacidad</Link>
        <div className="mlabel">Tema</div>
        <div className="segc" role="group" aria-label="Tema">
          {THEMES.map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={theme === value}
              onClick={() => {
                applyTheme(value);
                setTheme(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mlabel">Sesión</div>
        <button type="button" className="menu-btn" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
