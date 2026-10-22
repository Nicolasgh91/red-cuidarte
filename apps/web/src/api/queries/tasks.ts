import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { call } from "../rpc";
import { useApi } from "../../auth/AuthProvider";
import type { TaskGroup } from "../types";

interface TasksData {
  date: string;
  patients: TaskGroup[];
}

export function useTasks(date: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["tasks", date],
    queryFn: () => unwrap(call(api.tasks.$get, { query: { date } })),
  });
}

/** Tilda o destilda una tarea; actualiza la pantalla al instante y revierte si falla. */
export function useToggleTask(date: string) {
  const api = useApi();
  const qc = useQueryClient();
  const key = ["tasks", date];
  return useMutation({
    mutationFn: (v: { patient_id: string; task_key: string; done: boolean }) =>
      unwrap(call(api.tasks.completions.$post, { json: { date, ...v } })),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TasksData>(key);
      if (prev) {
        qc.setQueryData<TasksData>(key, {
          ...prev,
          patients: prev.patients.map((g) =>
            g.patient.id !== v.patient_id
              ? g
              : {
                  ...g,
                  tasks: g.tasks.map((t) => (t.key === v.task_key ? { ...t, done: v.done } : t)),
                },
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useAddTemplate() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (json: { patient_id: string; text: string; time?: string }) =>
      unwrap(call(api.tasks.templates.$post, { json })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useRemoveTemplate() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(call(api.tasks.templates[":id"].$delete, { param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
