import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { TokenVerifier } from "../deps.js";
import { HttpError, unauthorized } from "../errors.js";

/**
 * El token es el problema (vencido, firma o claims que no cierran): hay que volver a ingresar.
 * Cualquier otra cosa (no se pudo bajar el JWKS de Supabase, timeout, red) no es culpa del usuario.
 */
const tokenProblem = (e: unknown) =>
  e instanceof errors.JWTExpired ||
  e instanceof errors.JWTClaimValidationFailed ||
  e instanceof errors.JWTInvalid ||
  e instanceof errors.JWSInvalid ||
  e instanceof errors.JWSSignatureVerificationFailed ||
  e instanceof errors.JWKSNoMatchingKey ||
  e instanceof errors.JOSEAlgNotAllowed;

export function createJwtVerifier(getKey: JWTVerifyGetKey, issuer: string): TokenVerifier {
  return {
    async verify(token) {
      let sub: string | undefined;
      try {
        const { payload } = await jwtVerify(token, getKey, { issuer, audience: "authenticated" });
        sub = payload.sub;
      } catch (e) {
        if (tokenProblem(e)) {
          throw unauthorized("Tu sesión venció. Volvé a ingresar.", "invalid_token");
        }
        console.error("auth verify", { name: (e as Error)?.name, message: (e as Error)?.message });
        throw new HttpError(
          503,
          "auth_unavailable",
          "No pudimos verificar tu sesión ahora. Probá de nuevo en un momento.",
        );
      }
      if (!sub) throw unauthorized("Tu sesión venció. Volvé a ingresar.", "invalid_token");
      return { sub };
    },
  };
}

export function createSupabaseVerifier(supabaseUrl: string): TokenVerifier {
  const base = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
  return createJwtVerifier(createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`)), base);
}
