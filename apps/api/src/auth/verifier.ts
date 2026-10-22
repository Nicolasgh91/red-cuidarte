import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { TokenVerifier } from "../deps.js";
import { unauthorized } from "../errors.js";

export function createJwtVerifier(getKey: JWTVerifyGetKey, issuer: string): TokenVerifier {
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, getKey, { issuer, audience: "authenticated" });
        if (!payload.sub) throw new Error("sin sub");
        return { sub: payload.sub };
      } catch {
        throw unauthorized("Tu sesión venció. Volvé a ingresar.", "invalid_token");
      }
    },
  };
}

export function createSupabaseVerifier(supabaseUrl: string): TokenVerifier {
  const base = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
  return createJwtVerifier(createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`)), base);
}
