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
  let message = GENERIC_MESSAGE;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    /* cuerpo vacío o no JSON */
  }
  throw new ApiError(res.status, code, message);
}
