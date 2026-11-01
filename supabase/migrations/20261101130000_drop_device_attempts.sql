-- Se ejecuta DESPUÉS de 20261101120000_passkeys.sql y con la API nueva ya desplegada: la API
-- anterior todavía usaba device_attempts (bloqueos y «Autorizar el nuevo», reemplazados por F6).
drop table if exists device_attempts;
drop type if exists device_attempt_status;
