import { useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "../../api/errors";
import { useSendContact } from "../../api/queries/contact";
import { Field, GoBack } from "../../components/common";
import { Icon } from "../../components/icons";
import { CONTACT_EMAIL } from "../../lib/labels";

const MAX_SUBJECT = 100;
const MAX_MESSAGE = 2000;

export function Contacto() {
  const send = useSendContact();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!message.trim()) return setMessageError("Escribí tu mensaje.");
    setMessageError(null);
    try {
      await send.mutateAsync({ subject: subject.trim(), message: message.trim() });
      setSubject("");
      setMessage("");
      setSent(true);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  return (
    <div className="page narrow">
      <GoBack fallback="/" />
      <div className="head">
        <h1>Contacto</h1>
        <p className="sub">
          Escribinos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> o completá este
          formulario y te respondemos por mail.
        </p>
      </div>
      {sent ? (
        <div className="contact-done" role="status">
          <p>
            <Icon name="check" /> <b>Listo, recibimos tu mensaje.</b>
          </p>
          <p>Te respondemos al mail de tu cuenta.</p>
          <button type="button" className="ghost" onClick={() => setSent(false)}>
            Escribir otro mensaje
          </button>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <p className="note">No incluyas datos de salud ni de medicación en este mensaje.</p>
          <Field id="c-asunto" label="Asunto (opcional)">
            <input
              type="text"
              id="c-asunto"
              maxLength={MAX_SUBJECT}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
          <Field
            id="c-mensaje"
            label="Mensaje"
            hint={`${message.length} de ${MAX_MESSAGE} caracteres`}
            error={messageError}
          >
            <textarea
              id="c-mensaje"
              rows={6}
              maxLength={MAX_MESSAGE}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby={messageError ? "c-mensaje-err" : undefined}
            />
          </Field>
          {formError && (
            <p className="err" role="alert">
              {formError}
            </p>
          )}
          <button className="primary-btn auto" type="submit" disabled={send.isPending}>
            {send.isPending ? "Enviando…" : "Enviar mensaje"}
          </button>
        </form>
      )}
    </div>
  );
}
