import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { call } from "../rpc";
import { useApi } from "../../auth/AuthProvider";

interface NewWellbeing {
  mood: number;
  energy: number;
  stress: number;
  note: string;
}

/** Últimos 100 registros (el valor por defecto de la API). */
export function useWellbeingDaily() {
  const api = useApi();
  return useQuery({
    queryKey: ["wellbeing", "daily"],
    queryFn: async () => (await unwrap(call(api.wellbeing.$get, {}))).records,
  });
}

/** Promedios de las últimas 12 semanas (el valor por defecto de la API). */
export function useWellbeingWeekly() {
  const api = useApi();
  return useQuery({
    queryKey: ["wellbeing", "weekly"],
    queryFn: async () => (await unwrap(call(api.wellbeing.weekly.$get, {}))).weeks,
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
