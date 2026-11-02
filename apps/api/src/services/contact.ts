import type { AuthUser, Deps, Role } from "../deps.js";
import { HttpError } from "../errors.js";
import { hit } from "../lib/rateLimit.js";
import { nowAR } from "../lib/time.js";
import { addressOf, isMailConfigFailure, sendLogged } from "./mail.js";

const CONTACT_LIMIT = 3;

const ROLE_LABEL: Record<Role, string> = {
  caregiver: "Cuidador/a",
  admin: "Administrador/a",
  patient: "Persona cuidada",
};

/**
 * Manda el mensaje por mail a SMTP_FROM (Reply-To: la cuenta de quien escribe). No se guarda en la
 * base: si el envío falla, la web conserva lo escrito para reintentar. Los fallidos también
 * cuentan para el límite. Nunca se loguea el contenido del mensaje.
 */
export async function sendContact(
  deps: Deps,
  user: AuthUser,
  input: { subject: string; message: string },
): Promise<void> {
  const { sql, env, now } = deps;

  await hit(sql, `contact:${user.id}`, {
    limit: CONTACT_LIMIT,
    windowMs: 24 * 3_600_000,
    now: now(),
    message: `Ya mandaste ${CONTACT_LIMIT} mensajes en las últimas 24 horas. Probá de nuevo más tarde.`,
  });

  const [sender] = await sql<{ email: string | null; name: string | null }[]>`
    select u.email,
           coalesce(c.first_name || ' ' || c.last_names, a.first_name || ' ' || a.last_name,
                    p.first_name || ' ' || p.last_name) as name
    from users u
      left join caregivers c on c.user_id = u.id
      left join admins a on a.user_id = u.id
      left join patients p on p.user_id = u.id
    where u.id = ${user.id}`;

  const text = [
    "Mensaje enviado desde el formulario de Contacto de Cuidarte+.",
    "",
    `De: ${sender?.name ?? "(sin nombre)"}`,
    `Rol: ${ROLE_LABEL[user.role]}`,
    `Usuario: ${user.id}`,
    `Mail de la cuenta: ${sender?.email ?? "(sin mail)"}`,
    "",
    "Mensaje:",
    input.message,
  ].join("\n");

  const { status, failure } = await sendLogged(
    deps,
    {
      to: env.SMTP_FROM,
      subject: `[Contacto] ${input.subject || "Sin asunto"}`,
      text,
      replyTo: sender?.email ?? undefined,
    },
    "contact",
    nowAR(now()).year,
    { logSubject: "Mensaje de contacto" },
  );

  if (status !== "sent") {
    // Configuración (host, clave, TLS): reintentar no sirve, que escriba por otro lado.
    if (failure && isMailConfigFailure(failure.kind)) {
      throw new HttpError(
        503,
        "mail_unavailable",
        `El envío de mensajes no está disponible por ahora. Escribinos a ${addressOf(env.SMTP_FROM)}.`,
      );
    }
    throw new HttpError(
      502,
      "mail_failed",
      "No pudimos enviar tu mensaje ahora. Probá de nuevo en un rato.",
    );
  }
}
