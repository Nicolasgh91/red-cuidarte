import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { useApi } from "../../auth/AuthProvider";

export function usePatientToday() {
  const api = useApi();
  return useQuery({
    queryKey: ["patient-today"],
    queryFn: () => unwrap(api.patient.today.$get()),
  });
}

/** Código para que un cuidador/a se vincule con este paciente. */
export function useLinkCode() {
  const api = useApi();
  return useQuery({
    queryKey: ["link-code"],
    queryFn: () => unwrap(api.patient["link-code"].$get()),
  });
}

export function useRenewLinkCode() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.patient["link-code"].$post()),
    onSuccess: (data) => qc.setQueryData(["link-code"], data),
  });
}
