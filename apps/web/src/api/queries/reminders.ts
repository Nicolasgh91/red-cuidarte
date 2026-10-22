import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { call } from "../rpc";
import { useApi } from "../../auth/AuthProvider";
import type { ReminderSettings } from "../types";

export function useReminders(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: ["reminders"],
    queryFn: () => unwrap(api.reminders.$get()) as unknown as Promise<ReminderSettings>,
    enabled,
  });
}

export function useSaveReminders() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (json: ReminderSettings) => {
      await unwrap(call(api.reminders.$put, { json }));
      return json;
    },
    onSuccess: (saved) => qc.setQueryData(["reminders"], saved),
  });
}
