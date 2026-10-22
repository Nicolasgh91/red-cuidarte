import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

interface ToastItem {
  id: number;
  content: ReactNode;
}
interface ToastApi {
  /** Muestra un aviso; `ms` es cuánto dura (4 s por defecto). Devuelve su id. */
  toast(content: ReactNode, ms?: number): number;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast fuera de ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (content: ReactNode, ms = 4000) => {
      const id = next.current++;
      setItems((l) => [...l, { id, content }]);
      setTimeout(() => dismiss(id), ms);
      return id;
    },
    [dismiss],
  );
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            {t.content}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
