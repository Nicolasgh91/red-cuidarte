-- EJECUTAR DESPUÉS DEL DEPLOY DE LA API NUEVA (la anterior todavía usa estas tablas y columnas).
-- Va después de 20261101140000_rate_hits.sql.
--   · signup_attempts, link_attempts y contact_messages: los límites pasaron a rate_hits y el
--     formulario de contacto ya no guarda el mensaje (queda registrado en mail_log).
--   · device_events y devices.reauth_at: se quitaron la auditoría de la passkey y la
--     reautenticación del admin.
drop table if exists signup_attempts, link_attempts, contact_messages, device_events;
drop type if exists contact_status;
drop type if exists device_event_kind;

alter table devices drop column if exists reauth_at;

-- El valor 'reauth' del enum webauthn_purpose queda (Postgres no permite quitarlo sin recrear el
-- tipo); ya nada lo usa.
delete from webauthn_challenges where purpose = 'reauth';
