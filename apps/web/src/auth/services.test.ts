import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlowError, resetPassword, sendRecoveryCode } from "./services";

// Cliente de Supabase simulado: createClient devuelve siempre el mismo objeto, así que el cliente
// que services.ts guarda en memoria es el que cada test configura.
const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ auth })) }));

const session = { user: { id: "u1" } };

describe("servicios de Supabase Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://proyecto.supabase.test");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  });

  it("sendRecoveryCode pide el código con resetPasswordForEmail", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await expect(sendRecoveryCode("sofia@ejemplo.org")).resolves.toBeUndefined();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("sofia@ejemplo.org");
  });

  it("resetPassword: verifica el código (recovery) y después guarda la contraseña", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: null });

    await expect(resetPassword("sofia@ejemplo.org", "111111", "una-clave-larga")).resolves.toEqual({
      userId: "u1",
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "sofia@ejemplo.org",
      token: "111111",
      type: "recovery",
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "una-clave-larga" });
    expect(auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updateUser.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each([
    ["código inválido o vencido", { data: { session: null }, error: { code: "otp_expired" } }],
    ["verificación sin sesión", { data: { session: null }, error: null }],
  ])(
    "resetPassword: %s → mensaje de código incorrecto y no cambia la contraseña",
    async (_n, res) => {
      auth.verifyOtp.mockResolvedValue(res);
      const err = await resetPassword("sofia@ejemplo.org", "000000", "una-clave-larga").catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(AuthFlowError);
      expect((err as AuthFlowError).message).toBe(
        "El código no es correcto o venció. Pedí uno nuevo.",
      );
      expect(auth.updateUser).not.toHaveBeenCalled();
    },
  );

  it("resetPassword: weak_password → pide una contraseña más larga", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: { code: "weak_password" } });
    const err = await resetPassword("sofia@ejemplo.org", "111111", "corta").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AuthFlowError);
    expect((err as AuthFlowError).message).toBe(
      "Esa contraseña es muy débil. Probá con una más larga.",
    );
  });
});
