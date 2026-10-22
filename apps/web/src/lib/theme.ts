export type Theme = "light" | "dark" | "system";
export const THEME_KEY = "cuidarte.theme";
export const THEMES: readonly (readonly [Theme, string])[] = [
  ["light", "Claro"],
  ["dark", "Oscuro"],
  ["system", "Sistema"],
];

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Aplica el tema al <html> (data-theme) y lo guarda por dispositivo. */
export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* modo privado: no se guarda */
  }
}
