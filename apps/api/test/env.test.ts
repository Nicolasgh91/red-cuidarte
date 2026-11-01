import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";

const BASE = {
  DATABASE_URL: "postgres://localhost/x",
  MEDICATIONS_KEY: Buffer.alloc(32, 7).toString("base64"),
  DEVICE_TOKEN_SECRET: "test-device-token-secret-0123456789abcdef",
  CRON_SECRET: "test-cron-secret-123",
  WEBAUTHN_RP_ID: "redasistir.online",
  WEBAUTHN_ORIGINS: "https://redasistir.online",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "k",
  SMTP_HOST: "smtp.test",
  SMTP_USER: "u",
  SMTP_PASS: "p",
  GROQ_API_KEY: "g",
};
const load = (over: Record<string, string>) => loadEnv({ ...BASE, ...over });

describe("variables de WebAuthn", () => {
  it("normaliza los orígenes web (sin / final) y deja los de Android tal cual", () => {
    const env = load({
      WEBAUTHN_ORIGINS: "https://redasistir.online/ , android:apk-key-hash:abc",
      WEBAUTHN_RP_ID: " Redasistir.online ",
    });
    expect(env.WEBAUTHN_ORIGINS).toEqual(["https://redasistir.online", "android:apk-key-hash:abc"]);
    expect(env.WEBAUTHN_RP_ID).toBe("redasistir.online");
  });

  it("acepta subdominios del rpId", () => {
    expect(load({ WEBAUTHN_ORIGINS: "https://www.redasistir.online" }).WEBAUTHN_ORIGINS).toEqual([
      "https://www.redasistir.online",
    ]);
  });

  it("frena el arranque si un origen no es una URL", () => {
    expect(() => load({ WEBAUTHN_ORIGINS: "redasistir.online" })).toThrow(/WEBAUTHN_ORIGINS/);
  });

  it("frena el arranque si un origen no está bajo el rpId", () => {
    expect(() => load({ WEBAUTHN_ORIGINS: "https://red-cuidarte-web.vercel.app" })).toThrow(
      /WEBAUTHN_ORIGINS .*no está bajo WEBAUTHN_RP_ID/,
    );
  });

  it("el rpId es solo el dominio", () => {
    expect(() => load({ WEBAUTHN_RP_ID: "https://redasistir.online" })).toThrow(/WEBAUTHN_RP_ID/);
  });
});
