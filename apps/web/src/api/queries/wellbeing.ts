import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { call } from "../rpc";
import { useApi } from "../../auth/AuthProvider";

export interface NewWellbeing {
  mood: number;
  energy: number;
  stress: number;
  note: string;
}

export function useWellbeingDaily(limit = 100) {
  const api = useApi();
  return useQuery({
    queryKey: ["wellbeing", "daily", limit],
    queryFn: async () =>
      (await unwrap(call(api.wellbeing.$get, { query: { limit: String(limit) } }))).records,
  });
}

export function useWellbeingWeekly(weeks = 12) {
  const api = useApi();
  return useQuery({
    queryKey: ["wellbeing", "weekly", weeks],
    queryFn: async () =>
      (await unwrap(call(api.wellbeing.weekly.$get, { query: { weeks: String(weeks) } }))).weeks,
  });
}

export function useSaveWellbeing() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (json: NewWellbeing) => unwrap(call(api.wellbeing.$post, { json })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wellbeing"] }),
  });
}
