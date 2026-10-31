import { useQuery } from "@tanstack/react-query";
import { API_URL } from "../client";
import { DEFAULT_CONTENT } from "../../content";
import type { SiteContent } from "../../content";

/**
 * Contenido público de la web. Se pide sin sesión (la landing y la política de privacidad se ven
 * sin ingresar) y, mientras llega o si falla, se muestran los textos originales.
 */
async function fetchContent(): Promise<SiteContent> {
  const res = await fetch(`${API_URL}/content`);
  if (!res.ok) throw new Error(`content ${res.status}`);
  return { ...DEFAULT_CONTENT, ...((await res.json()) as Partial<SiteContent>) };
}

export function useContent(): SiteContent {
  const q = useQuery({
    queryKey: ["content"],
    queryFn: fetchContent,
    placeholderData: DEFAULT_CONTENT,
    staleTime: 60_000,
    retry: false,
  });
  return q.data ?? DEFAULT_CONTENT;
}
