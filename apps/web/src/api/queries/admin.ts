import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { call } from "../rpc";
import { useApi } from "../../auth/AuthProvider";
import type { ContentKey, SiteContent } from "../../content";
import type { CaregiverProfile } from "../types";

export function useAdminSummary() {
  const api = useApi();
  return useQuery({
    queryKey: ["admin", "summary"],
    queryFn: () => unwrap(api.admin.summary.$get()),
  });
}
export function useAdminCaregivers() {
  const api = useApi();
  return useQuery({
    queryKey: ["admin", "caregivers"],
    queryFn: async () => (await unwrap(api.admin.caregivers.$get())).caregivers,
  });
}
export function useAdminPatients() {
  const api = useApi();
  return useQuery({
    queryKey: ["admin", "patients"],
    queryFn: async () => (await unwrap(api.admin.patients.$get())).patients,
  });
}
export function useAdminAdmins() {
  const api = useApi();
  return useQuery({
    queryKey: ["admin", "admins"],
    queryFn: async () => (await unwrap(api.admin.admins.$get())).admins,
  });
}
export function useAdminDevices() {
  const api = useApi();
  return useQuery({
    queryKey: ["admin", "devices"],
    queryFn: async () => (await unwrap(api.admin.devices.$get())).devices,
  });
}
export function useMailLog() {
  const api = useApi();
  return useQuery({
    queryKey: ["admin", "mail-log"],
    queryFn: async () => (await unwrap(api.admin.mail.log.$get())).log,
  });
}

/** Mutación del panel de admin que refresca todo lo de "admin" al terminar. */
function useAdminMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
}

export function useAddCaregiver() {
  const api = useApi();
  return useAdminMutation((json: CaregiverProfile & { patient_ids: string[] }) =>
    unwrap(call(api.admin.caregivers.$post, { json })),
  );
}
export function useAssignPatients() {
  const api = useApi();
  return useAdminMutation((v: { id: string; patient_ids: string[] }) =>
    unwrap(
      call(api.admin.caregivers[":id"].patients.$put, {
        param: { id: v.id } as never,
        json: { patient_ids: v.patient_ids } as never,
      }),
    ),
  );
}
export function useAddPatient() {
  const api = useApi();
  return useAdminMutation((json: { first_name: string; last_name: string; email?: string }) =>
    unwrap(call(api.admin.patients.$post, { json })),
  );
}
export function useAddMedication() {
  const api = useApi();
  return useAdminMutation((v: { patientId: string; name: string; dose: string; times: string[] }) =>
    unwrap(
      call(api.admin.patients[":id"].medications.$post, {
        param: { id: v.patientId } as never,
        json: { name: v.name, dose: v.dose, times: v.times } as never,
      }),
    ),
  );
}
export function useRemoveMedication() {
  const api = useApi();
  return useAdminMutation((id: string) =>
    unwrap(call(api.admin.medications[":id"].$delete, { param: { id } })),
  );
}
export function useResetPasskey() {
  const api = useApi();
  return useAdminMutation((id: string) =>
    unwrap(call(api.admin.devices[":id"].release.$post, { param: { id } })),
  );
}
export function useSendTestMail() {
  const api = useApi();
  return useAdminMutation((to: string) =>
    unwrap(call(api.admin.mail.test.$post, { json: { to } })),
  );
}

/** Contenido de la web con la lista de claves que el admin ya editó. */
export function useAdminContent() {
  const api = useApi();
  return useQuery({
    queryKey: ["admin", "content"],
    queryFn: async () =>
      (await unwrap(api.admin.content.$get())) as unknown as {
        content: SiteContent;
        custom: ContentKey[];
      },
  });
}

/** Mutación de contenido: refresca el panel y lo que ve el resto de la web. */
function useContentMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["admin"] }),
        qc.invalidateQueries({ queryKey: ["content"] }),
      ]),
  });
}

export function useSaveContent() {
  const api = useApi();
  return useContentMutation((v: { key: ContentKey; value: SiteContent[ContentKey] }) =>
    unwrap(
      // El cuerpo se valida en la API según la clave, así que el tipo del cliente no lo declara.
      call(api.admin.content[":key"].$put, {
        param: { key: v.key },
        json: v.value,
      } as never),
    ),
  );
}

/** Vuelve al texto original de una clave. */
export function useResetContent() {
  const api = useApi();
  return useContentMutation((key: ContentKey) =>
    unwrap(call(api.admin.content[":key"].$delete, { param: { key } as never })),
  );
}
