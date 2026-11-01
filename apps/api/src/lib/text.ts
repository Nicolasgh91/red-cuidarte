/** Minúsculas, sin tildes y con los espacios colapsados: para comparar lo que escribe la gente. */
export const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
