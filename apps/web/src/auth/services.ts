import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Lo que el front necesita de Supabase Auth (se reemplaza en los tests). */
export interface AuthServices {
  getSession(): Promise<{ userId: string } | null>;
  /** Avisa si la sesión se pierde (vencida, cerrada en otra pestaña). Devuelve cómo dejar de escuchar. */
  onSignedOut(cb: () => void): () => void;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<{ userId: string }>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

/** Error con mensaje listo para mostrar. */
export class AuthFlowError extends Error {}

export const NOT_REGISTERED_MESSAGE =
  "Tu cuenta todavía no está dada de alta. Pedile al administrador que la cargue.";

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new AuthFlowError(
      "Falta configurar el ingreso (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).",
    );
  }
  client = createClient(url, key, {
    // Sin enlaces mágicos: el ingreso es por código, así funciona igual en PWA y en Capacitor.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export const supabaseServices: AuthServices = {
  async getSession() {
    const { data } = await supabase().auth.getSession();
    return data.session ? { userId: data.session.user.id } : null;
  },
  onSignedOut(cb) {
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") cb();
    });
    return () => data.subscription.unsubscribe();
  },
  async sendCode(email) {
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (!error) return;
    if (/signups? not allowed|not found|user.*not/i.test(error.message))
      throw new AuthFlowError(NOT_REGISTERED_MESSAGE);
    if (error.status === 429 || /rate limit|too many|seconds/i.test(error.message))
      throw new AuthFlowError(
        "Pediste varios códigos seguidos. Esperá un minuto y probá de nuevo.",
      );
    throw new AuthFlowError("No pudimos mandar el código. Probá de nuevo en un rato.");
  },
  async verifyCode(email, code) {
    const { data, error } = await supabase().auth.verifyOtp({ email, token: code, type: "email" });
    if (error || !data.session) {
      throw new AuthFlowError("El código no es correcto o venció. Pedí uno nuevo.");
    }
    return { userId: data.session.user.id };
  },
  async signOut() {
    await supabase().auth.signOut();
  },
  async getAccessToken() {
    const { data } = await supabase().auth.getSession();
    return data.session?.access_token ?? null;
  },
};
