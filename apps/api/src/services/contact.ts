import type { AuthUser, Deps, Role } from "../deps.js";
import { HttpError } from "../errors.js";
import { nowAR } from "../lib/time.js";
import { sendLogged } from "./mail.js";

export const CONTACT_LIMIT = 3;

const ROLE_LABEL: Record<Role, string> = {
  caregiver: "Cuidador/a",
  admin: "Administrador/a",
  patient: "Persona cuidada",
};

/**
 * Guarda el mensaje y lo manda por mail a SMTP_FROM (Reply-To: la cuenta de quien escribe).
 * El límite se cuenta en la base (el backend no guarda estado): el lock por usuario evita que dos
 * pedidos simultáneos lo salteen. Nunca se loguea el contenido del mensaje.
 */
export async function sendContact(
  deps: Deps,
  user: AuthUser,
  input: { subject: string; message: string },
): Promise<void> {
  const { sql, env, now } = deps;

  const [row] = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${user.id}::text))`;
    const [counted] = await tx<{ n: number }[]>`
      select count(*)::int as n from contact_messages
      where user_id = ${user.id} and created_at > now() - interval '24 hours'`;
    if ((counted?.n ?? 0) >= CONTACT_LIMIT) {
      throw new HttpError(
        429,
        "rate_limited",
        `Ya mandaste ${CONTACT_LIMIT} mensajes en las últimas 24 horas. Probá de nuevo más tarde.`,
      );
    }
    // Queda 'failed' hasta confirmar el envío: si la función se corta a mitad de camino no figura como enviado.
    return tx<{ id: string }[]>`
      insert into contact_messages (user_id, subject, message, status, error)
      values (${user.id}, ${input.subject}, ${input.message}, 'failed', 'No se llegó a enviar')
      returning id`;
  });
  const id = row!.id;

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

  const status = await sendLogged(
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
    throw new HttpError(
      502,
      "mail_failed",
      "No pudimos enviar tu mensaje ahora. Quedó guardado; probá de nuevo en un rato.",
    );
  }
  await sql`update contact_messages set status = 'sent', error = null where id = ${id}`;
}
