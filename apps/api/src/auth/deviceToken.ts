import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { SignJWT, jwtVerify } from "jose";

const key = (secret: string) => new TextEncoder().encode(secret);
const TTL_SECONDS = 30 * 24 * 60 * 60;

/** Token que prueba que este cliente verificó la passkey de la cuenta. */
export async function signDeviceToken(
  secret: string,
  userId: string,
  credentialId: string,
): Promise<string> {
  return new SignJWT({ cid: credentialId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function verifyDeviceToken(
  secret: string,
  token: string,
): Promise<{ sub: string; cid: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.cid !== "string") return null;
    return { sub: payload.sub, cid: payload.cid };
  } catch {
    return null;
  }
}

/**
 * En la web el token viaja solo en esta cookie: HttpOnly (un script no la lee), __Host- (sin
 * Domain, Path=/, Secure) y SameSite=Strict. Las mismas opciones se usan para emitirla y borrarla.
 */
export const DEVICE_COOKIE = "cuidarte_device";
const COOKIE_OPTS: CookieOptions = {
  prefix: "host",
  httpOnly: true,
  secure: true,
  sameSite: "Strict",
  path: "/",
};

export const readDeviceCookie = (c: Context) => getCookie(c, DEVICE_COOKIE, "host");
export const setDeviceCookie = (c: Context, token: string) =>
  setCookie(c, DEVICE_COOKIE, token, { ...COOKIE_OPTS, maxAge: TTL_SECONDS });
export const clearDeviceCookie = (c: Context) => void deleteCookie(c, DEVICE_COOKIE, COOKIE_OPTS);
