/** Error de la API: cuerpo `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const NETWORK_MESSAGE = "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.";
export const GENERIC_MESSAGE = "Algo salió mal. Probá de nuevo.";

/** Qué decir cuando la respuesta de error no trae mensaje (corte del gateway, timeout, cuerpo no JSON). */
export function statusMessage(status: number): string {
  if (status === 401) return "Tu sesión venció. Volvé a ingresar.";
  if (status === 403) return "No tenés permiso para hacer esto.";
  if (status === 404) return "No encontramos lo que buscás.";
  if (status === 408 || status === 504) return "La respuesta tardó demasiado. Probá de nuevo.";
  if (status === 413) return "Lo que querés enviar es demasiado grande.";
  if (status === 429)
    return "Hiciste muchos intentos seguidos. Esperá un momento y probá de nuevo.";
  if (status >= 500) return "Tuvimos un problema de nuestro lado. Probá de nuevo en un momento.";
  return GENERIC_MESSAGE;
}

export const errorMessage = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : GENERIC_MESSAGE;

export const errorCode = (e: unknown): string | null => (e instanceof ApiError ? e.code : null);

interface JsonResponse<T> {
  ok: boolean;
  status: number;
  json(): Promise<T>;
}

/** Devuelve el cuerpo JSON o lanza ApiError con el mensaje del servidor. */
export async function unwrap<T>(request: Promise<JsonResponse<T>>): Promise<T> {
  let res: JsonResponse<T>;
  try {
    res = await request;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "network", NETWORK_MESSAGE);
  }
  if (res.ok) return res.json();
  let code = "error";
  let message = statusMessage(res.status);
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    /* cuerpo vacío o no JSON */
  }
  throw new ApiError(res.status, code, message);
}
