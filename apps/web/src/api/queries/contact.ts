import { useMutation } from "@tanstack/react-query";
import { unwrap } from "../errors";
import { call } from "../rpc";
import { useApi } from "../../auth/AuthProvider";

export function useSendContact() {
  const api = useApi();
  return useMutation({
    mutationFn: (json: { subject: string; message: string }) =>
      unwrap(call(api.contact.$post, { json })),
  });
}
