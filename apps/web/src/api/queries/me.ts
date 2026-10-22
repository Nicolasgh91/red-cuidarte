import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { call } from "../rpc";
import { useApi } from "../../auth/AuthProvider";
import type { CaregiverProfile, Me } from "../types";

export function useMe() {
  const api = useApi();
  return useQuery({
    queryKey: ["me"],
    queryFn: () => unwrap(api.me.$get()) as Promise<Me>,
  });
}

/** Pacientes asignados al cuidador (con su medicación). */
export function useMyPatients() {
  const api = useApi();
  return useQuery({
    queryKey: ["my-patients"],
    queryFn: async () => (await unwrap(api.me.patients.$get())).patients,
  });
}

export function useSaveProfile() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (json: CaregiverProfile) => unwrap(call(api.me.profile.$put, { json })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useDeleteAccount() {
  const api = useApi();
  return useMutation({ mutationFn: () => unwrap(api.me.$delete()) });
}

export function useDeviceStatus() {
  const api = useApi();
  return useQuery({
    queryKey: ["device-status"],
    queryFn: () => unwrap(api.device.status.$get()),
  });
}
