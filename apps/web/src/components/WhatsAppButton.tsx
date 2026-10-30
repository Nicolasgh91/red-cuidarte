import type { Role } from "../api/types";

// +54 9 11 3042-8741, formato internacional sin + ni separadores, como lo pide wa.me
export const WHATSAPP_NUMBER = "5491130428741";
export const WHATSAPP_GREETING = "Hola, te escribo desde Cuidarte+.";

/** Botón flotante de contacto por WhatsApp; solo para cuidadores y pacientes. */
export function WhatsAppButton({ role }: { role: Role }) {
  if (role !== "caregiver" && role !== "patient") return null;
  return (
    <a
      className="wa-fab"
      href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_GREETING)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp"
    >
      {/* Ícono propio: globo de diálogo con un teléfono adentro. */}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 7.8c.3-.3.8-.3 1 .1l.8 1.4c.2.3.1.7-.1.9l-.5.5c.5 1.1 1.4 2 2.5 2.5l.5-.5c.2-.2.6-.3.9-.1l1.4.8c.4.2.4.7.1 1l-.6.6c-.6.6-1.5.7-2.3.3a8.4 8.4 0 0 1-4.2-4.2c-.4-.8-.3-1.7.3-2.3z"
          fill="currentColor"
        />
      </svg>
    </a>
  );
}
