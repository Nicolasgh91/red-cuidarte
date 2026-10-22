import { useQuery } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { useApi } from "../../auth/AuthProvider";

export function usePatientToday() {
  const api = useApi();
  return useQuery({
    queryKey: ["patient-today"],
    queryFn: () => unwrap(api.patient.today.$get()),
  });
}
