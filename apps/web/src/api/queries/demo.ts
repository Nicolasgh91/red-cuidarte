import { useQuery } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { useApi } from "../../auth/AuthProvider";

/** Modo demo: usuarios de la base para el selector de ingreso. */
export function useDemoUsers() {
  const api = useApi();
  return useQuery({
    queryKey: ["demo-users"],
    queryFn: async () => (await unwrap(api.demo.users.$get())).users,
  });
}
