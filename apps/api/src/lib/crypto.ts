import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Formato: iv (12) | tag (16) | texto cifrado. Clave AES-256 en base64.
export const encrypt = (keyB64: string, plain: string): Buffer => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
};

export const decrypt = (keyB64: string, data: Buffer): string => {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyB64, "base64"),
    data.subarray(0, 12),
  );
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
};
