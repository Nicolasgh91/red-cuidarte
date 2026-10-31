import { describe, expect, it } from "vitest";
import { authReducer, initialAuthState } from "./machine";
import type { AuthEvent, AuthState } from "./machine";

const run = (events: AuthEvent[], from: AuthState = initialAuthState): AuthState =>
  events.reduce(authReducer, from);

describe("máquina de ingreso", () => {
  it("empieza cargando y, sin sesión, queda afuera", () => {
    expect(initialAuthState).toEqual({ status: "loading" });
    expect(run([{ type: "no_session" }])).toEqual({ status: "signed-out", error: null });
  });

  it("con sesión y token de dispositivo va directo a la app", () => {
    expect(run([{ type: "session_restored", hasDeviceToken: true }])).toEqual({ status: "ready" });
  });

  it("con sesión pero sin token, verifica el dispositivo", () => {
    expect(run([{ type: "session_restored", hasDeviceToken: false }])).toEqual({
      status: "device-check",
      phase: "checking",
      error: null,
    });
  });

  it("flujo completo: sesión abierta → dispositivo → listo", () => {
    const s = run([{ type: "no_session" }, { type: "signed_in" }, { type: "device_ok" }]);
    expect(s).toEqual({ status: "ready" });
  });

  it("al abrir la sesión limpia el error anterior y verifica el dispositivo", () => {
    expect(authReducer({ status: "signed-out", error: "venció" }, { type: "signed_in" })).toEqual({
      status: "device-check",
      phase: "checking",
      error: null,
    });
  });

  it("la verificación del dispositivo puede pedir un gesto y reintentarse", () => {
    const base = run([
      { type: "session_restored", hasDeviceToken: false },
      { type: "device_prompt", phase: "register", error: "falló" },
    ]);
    expect(base).toEqual({ status: "device-check", phase: "register", error: "falló" });
    expect(authReducer(base, { type: "device_checking" })).toEqual({
      status: "device-check",
      phase: "checking",
      error: null,
    });
  });

  it("dispositivo bloqueado: muestra el mensaje y se puede reintentar", () => {
    const blocked = run([
      { type: "session_restored", hasDeviceToken: false },
      { type: "device_blocked", message: "Otro dispositivo" },
    ]);
    expect(blocked).toEqual({ status: "blocked", message: "Otro dispositivo" });
    expect(authReducer(blocked, { type: "device_checking" }).status).toBe("device-check");
  });

  it("cuenta no dada de alta", () => {
    expect(
      run([{ type: "session_restored", hasDeviceToken: false }, { type: "not_registered" }]),
    ).toEqual({ status: "not-registered" });
  });

  it("estando listo, un 403 de dispositivo vuelve a la verificación o al bloqueo", () => {
    const ready: AuthState = { status: "ready" };
    expect(authReducer(ready, { type: "device_prompt", phase: "login", error: null })).toEqual({
      status: "device-check",
      phase: "login",
      error: null,
    });
    expect(authReducer(ready, { type: "device_blocked", message: "m" }).status).toBe("blocked");
    expect(authReducer(ready, { type: "device_checking" }).status).toBe("device-check");
  });

  it("cerrar sesión funciona desde cualquier estado", () => {
    for (const s of [
      { status: "ready" },
      { status: "blocked", message: "m" },
      { status: "not-registered" },
      { status: "device-check", phase: "login", error: null },
    ] as AuthState[]) {
      expect(authReducer(s, { type: "signed_out" })).toEqual({ status: "signed-out", error: null });
    }
    expect(authReducer({ status: "ready" }, { type: "signed_out", error: "venció" })).toEqual({
      status: "signed-out",
      error: "venció",
    });
  });

  it("ignora eventos que no corresponden al estado", () => {
    const signedOut: AuthState = { status: "signed-out", error: null };
    expect(authReducer(signedOut, { type: "device_ok" })).toBe(signedOut);
    expect(authReducer(signedOut, { type: "device_blocked", message: "x" })).toBe(signedOut);
    const ready: AuthState = { status: "ready" };
    expect(authReducer(ready, { type: "session_restored", hasDeviceToken: false })).toBe(ready);
    expect(authReducer(ready, { type: "signed_in" })).toBe(ready);
  });
});
