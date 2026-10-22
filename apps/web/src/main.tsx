import { Capacitor } from "@capacitor/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiError } from "./api/errors";
import { App } from "./App";
import { applyTheme, getStoredTheme } from "./lib/theme";
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/views.css";
import "./styles/overlay.css";
import "./styles/auth.css";
import "./styles/responsive.css";

applyTheme(getStoredTheme());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Los errores 4xx (permisos, datos) no se arreglan reintentando.
      retry: (count, error) =>
        count < 2 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

// En la app Android los assets ya están dentro del paquete: no hace falta service worker.
if ("serviceWorker" in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
