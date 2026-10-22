import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { call } from "../rpc";
import { useApi } from "../../auth/AuthProvider";

export interface NewShiftInput {
  patient_id: string;
  date: string;
  start: string;
  end: string;
  repeat_weeks: 1 | 4 | 8;
}

export function useShifts(from: string, to: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["shifts", from, to],
    queryFn: async () => (await unwrap(call(api.shifts.$get, { query: { from, to } }))).shifts,
  });
}

export function useCreateShift() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (json: NewShiftInput) => unwrap(call(api.shifts.$post, { json })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export function useDeleteShift() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(call(api.shifts[":id"].$delete, { param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
}
