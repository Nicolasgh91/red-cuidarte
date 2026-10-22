import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps.js";
import { HttpError } from "../errors.js";
import { uuid } from "../lib/schemas.js";
import { validate } from "../lib/validate.js";
import {
  AssistantBusyError,
  AssistantLimitError,
  DAILY_LIMIT,
  runAssistant,
  undoAssistantShifts,
} from "../services/assistant.js";

const chatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(14)
    .refine((m) => m.at(-1)?.role === "user", "El último mensaje tiene que ser tuyo."),
});

export const assistant = new Hono<AppEnv>()
  .post("/chat", validate("json", chatBody), async (c) => {
    try {
      return c.json(
        await runAssistant(c.get("deps"), c.get("user").id, c.req.valid("json").messages),
      );
    } catch (e) {
      if (e instanceof AssistantLimitError) {
        throw new HttpError(
          429,
          "assistant_limit",
          `Llegaste al límite de ${DAILY_LIMIT} mensajes de hoy. Mañana podés seguir.`,
        );
      }
      if (e instanceof AssistantBusyError) {
        throw new HttpError(
          429,
          "assistant_busy",
          "Hay muchas consultas seguidas. Probá de nuevo en un rato.",
        );
      }
      throw e;
    }
  })
  .post(
    "/undo",
    validate("json", z.object({ shift_ids: z.array(uuid).min(1).max(40) })),
    async (c) => {
      const deleted = await undoAssistantShifts(
        c.get("deps"),
        c.get("user").id,
        c.req.valid("json").shift_ids,
      );
      return c.json({ deleted });
    },
  );
