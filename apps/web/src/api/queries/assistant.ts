import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { call } from "../rpc";
import { useApi } from "../../auth/AuthProvider";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function useAssistantChat() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messages: ChatTurn[]) =>
      unwrap(call(api.assistant.chat.$post, { json: { messages: messages.slice(-14) } })),
    onSuccess: (r) => {
      if (r.added.length) void qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

export function useAssistantUndo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shift_ids: string[]) =>
      unwrap(call(api.assistant.undo.$post, { json: { shift_ids } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
}
