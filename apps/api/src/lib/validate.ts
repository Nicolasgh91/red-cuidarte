import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import { badRequest } from "../errors.js";

type Target = "json" | "query" | "param";

/** zValidator con el error en el formato de la API. */
export const validate = <Tg extends Target, T extends ZodType>(target: Tg, schema: T) =>
  zValidator(target, schema, (result) => {
    if (result.success === false) {
      const first = result.error.issues[0];
      throw badRequest(first?.message ?? "Revisá los datos enviados.", "invalid_input");
    }
  });
