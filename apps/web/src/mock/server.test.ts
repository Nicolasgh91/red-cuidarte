import { beforeAll, describe, expect, it } from "vitest";
import { API_URL } from "../api/client";
import { installMock } from "./server";

const CAREGIVER = "c0000000-0000-4000-8000-000000000001";
const ADMIN = "a0000000-0000-4000-8000-000000000001";
const PATIENT = "b0000000-0000-4000-8000-000000000001";

const call = (path: string, as?: string, json?: unknown) =>
  fetch(`${API_URL}${path}`, {
    method: json === undefined ? "GET" : "POST",
    headers: {
      ...(as ? { Authorization: `Bearer demo:${as}` } : {}),
      ...(json === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });

beforeAll(() => installMock());

describe("API mock (solo desarrollo local)", () => {
  it("lista los usuarios demo y devuelve el perfil de cada rol", async () => {
    const { users } = (await (await call("/demo/users")).json()) as { users: { role: string }[] };
    expect(users.map((u) => u.role)).toEqual([
      "admin",
      "caregiver",
      "caregiver",
      "patient",
      "patient",
    ]);
    for (const id of [CAREGIVER, ADMIN, PATIENT]) {
      expect((await call("/me", id)).status).toBe(200);
    }
    expect((await call("/me")).status).toBe(401);
  });

  it("sirve turnos, tareas y el día de la persona cuidada", async () => {
    const shifts = (await (
      await call("/shifts?from=2000-01-01&to=2999-12-31", CAREGIVER)
    ).json()) as {
      shifts: unknown[];
    };
    expect(shifts.shifts.length).toBeGreaterThan(0);
    const t = (await (await call("/tasks?date=2026-01-01", CAREGIVER)).json()) as {
      patients: { tasks: unknown[] }[];
    };
    expect(t.patients[0]!.tasks.length).toBeGreaterThan(0);
    expect((await call("/patient/today", PATIENT)).status).toBe(200);
    expect((await call("/admin/summary", ADMIN)).status).toBe(200);
    expect((await call("/admin/summary", CAREGIVER)).status).toBe(403);
  });

  it("contacto: valida, limita a 3 por 24 h y permite simular el error 502", async () => {
    expect((await call("/contact", CAREGIVER, { message: "  " })).status).toBe(400);
    expect(
      (await call("/contact", ADMIN, { subject: "x".repeat(101), message: "hola" })).status,
    ).toBe(400);
    expect((await call("/contact")).status).toBe(404); // GET /contact no existe
    expect((await call("/contact", undefined, { message: "hola" })).status).toBe(401);

    expect((await call("/contact", CAREGIVER, { message: "uno" })).status).toBe(200);
    expect((await call("/contact", CAREGIVER, { message: "dos [mock:502]" })).status).toBe(502);
    expect((await call("/contact", CAREGIVER, { message: "tres" })).status).toBe(200);
    const r = await call("/contact", CAREGIVER, { message: "cuatro" });
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
  });

  it("deja pasar lo que no es de la API", async () => {
    await expect(fetch("http://127.0.0.1:1/no-existe")).rejects.toBeTruthy();
  });
});
