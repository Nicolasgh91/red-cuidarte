import nodemailer from "nodemailer";
import type { Env } from "../env.js";
import type { Mailer } from "../deps.js";

/** SMTP de la casilla avisos@ en DonWeb. 465 = TLS directo; 587 = STARTTLS. */
export function createSmtpMailer(env: Env): Mailer {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
    },
  };
}
