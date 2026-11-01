import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
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

/** Cambió un paciente o su medicación: también cambia el checklist del día. */
const invalidatePatients = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ["my-patients"] }),
    qc.invalidateQueries({ queryKey: ["tasks"] }),
  ]);

/** Pacientes asignados al cuidador (con su medicación). */
export function useMyPatients() {
  const api = useApi();
  return useQuery({
    queryKey: ["my-patients"],
    queryFn: async () => (await unwrap(api.me.patients.$get())).patients,
  });
}

/** El cuidador/a da de alta a una persona cuidada y queda asignado a ella. */
export function useAddMyPatient() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (json: { first_name: string; last_name: string; email?: string }) =>
      unwrap(call(api.me.patients.$post, { json })),
    onSuccess: () => invalidatePatients(qc),
  });
}

/** El cuidador/a canjea el código que le pasó una persona cuidada. */
export function useLinkPatient() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => unwrap(call(api.me.patients.link.$post, { json: { code } })),
    onSuccess: () => invalidatePatients(qc),
  });
}

/** Medicación de un paciente asignado: la carga el cuidador/a. */
export function useAddMyMedication() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { patientId: string; name: string; dose: string; times: string[] }) =>
      unwrap(
        call(api.me.patients[":id"].medications.$post, {
          param: { id: v.patientId } as never,
          json: { name: v.name, dose: v.dose, times: v.times } as never,
        }),
      ),
    onSuccess: () => invalidatePatients(qc),
  });
}

export function useRemoveMyMedication() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(call(api.me.medications[":id"].$delete, { param: { id } })),
    onSuccess: () => invalidatePatients(qc),
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
