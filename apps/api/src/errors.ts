import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = "bad_request") =>
  new HttpError(400, code, message);
export const unauthorized = (message = "Tenés que iniciar sesión.", code = "unauthorized") =>
  new HttpError(401, code, message);
export const forbidden = (message = "No tenés permiso para hacer esto.", code = "forbidden") =>
  new HttpError(403, code, message);
export const notFound = (message = "No encontramos lo que buscás.", code = "not_found") =>
  new HttpError(404, code, message);
export const conflict = (message: string, code = "conflict") => new HttpError(409, code, message);
