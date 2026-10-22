import { SignJWT, jwtVerify } from "jose";

const key = (secret: string) => new TextEncoder().encode(secret);
const TTL = "30d";

/** Token que prueba que este cliente verificó la passkey del dispositivo registrado. */
export async function signDeviceToken(
  secret: string,
  userId: string,
  credentialId: string,
): Promise<string> {
  return new SignJWT({ cid: credentialId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TTL)
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
