export const okMail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const okPhone = (s: string): boolean => /^[1-9][\d ]{7,14}$/.test(s);

export const MSG = {
  mail: "Revisá el mail, por ejemplo nombre@dominio.com.",
  phone: "Escribí el celular con código de área, sin el 0 ni el 15.",
  birth: "Revisá la fecha: día/mes/año, por ejemplo 14/05/1980.",
} as const;
