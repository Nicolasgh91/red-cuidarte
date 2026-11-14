export const okMail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const okPhone = (s: string): boolean => /^[1-9][\d ]{7,14}$/.test(s);

/**
 * Largo máximo de nombres y apellidos. Debe coincidir con `name` en
 * apps/api/src/lib/schemas.ts:7 (.max(100)); si cambia allá, cambiarlo acá.
 */
export const MAX_NAME = 100;

export const MSG = {
  mail: "Revisá el mail, por ejemplo nombre@dominio.com.",
  phone: "Escribí el celular con código de área, sin el 0 ni el 15.",
  birth: "Revisá la fecha: día/mes/año, por ejemplo 14/05/1980.",
} as const;
