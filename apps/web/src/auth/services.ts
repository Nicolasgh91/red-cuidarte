// Supabase Auth: lo único que la web le pide a Supabase (la base la toca solo la API).
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Error con mensaje listo para mostrar. */
export class AuthFlowError extends Error {}

const TOO_MANY_MESSAGE = "Hubo varios intentos seguidos. Esperá un minuto y probá de nuevo.";
const tooMany = (error: { status?: number; message: string }) =>
  error.status === 429 || /rate limit|too many|seconds/i.test(error.message);

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
    throw new AuthFlowError("No pudimos iniciar el ingreso. Probá de nuevo más tarde.");
  }
  client = createClient(url, key, {
    // Sin enlaces: la recuperación es por código, así funciona igual en PWA y en Capacitor.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export async function getSession(): Promise<{ userId: string } | null> {
  const { data } = await supabase().auth.getSession();
  return data.session ? { userId: data.session.user.id } : null;
}

/** Avisa si la sesión se pierde (vencida, cerrada en otra pestaña). Devuelve cómo dejar de escuchar. */
export function onSignedOut(cb: () => void): () => void {
  const { data } = supabase().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") cb();
  });
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<{ userId: string }> {
  const { data, error } = await supabase().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    if (error && tooMany(error)) throw new AuthFlowError(TOO_MANY_MESSAGE);
    if (error?.code === "email_not_confirmed")
      throw new AuthFlowError("Tu mail todavía no está confirmado. Pedile ayuda al administrador.");
    throw new AuthFlowError(
      error?.status === 400 || error?.code === "invalid_credentials"
        ? "Mail o contraseña incorrectos. Si es tu primera vez, definí tu contraseña con «¿Primera vez u olvidaste tu contraseña?»."
        : "No pudimos iniciar sesión. Probá de nuevo en un rato.",
    );
  }
  return { userId: data.session.user.id };
}

/** Manda el código de 6 dígitos para definir o cambiar la contraseña. */
export async function sendRecoveryCode(email: string): Promise<void> {
  const { error } = await supabase().auth.resetPasswordForEmail(email);
  if (!error) return;
  if (tooMany(error)) throw new AuthFlowError(TOO_MANY_MESSAGE);
  throw new AuthFlowError("No pudimos mandar el código. Probá de nuevo en un rato.");
}

/** Valida el código, abre la sesión y guarda la contraseña nueva. */
export async function resetPassword(
  email: string,
  code: string,
  password: string,
): Promise<{ userId: string }> {
  const { data, error } = await supabase().auth.verifyOtp({
    email,
    token: code,
    type: "recovery",
  });
  if (error || !data.session) {
    throw new AuthFlowError("El código no es correcto o venció. Pedí uno nuevo.");
  }
  const updated = await supabase().auth.updateUser({ password });
  if (updated.error) {
    throw new AuthFlowError(
      updated.error.code === "weak_password"
        ? "Esa contraseña es muy débil. Probá con una más larga."
        : "No pudimos guardar la contraseña. Probá de nuevo.",
    );
  }
  return { userId: data.session.user.id };
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
