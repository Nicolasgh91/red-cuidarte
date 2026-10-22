import type { AppType } from "api";
import type { InferResponseType, hc } from "hono/client";

export type Role = "caregiver" | "admin" | "patient";

/** Cliente tipado de Hono RPC contra apps/api (AppType). */
export type ApiClient = ReturnType<typeof hc<AppType>>;

export type Res<T extends (...args: never[]) => Promise<Response>> = InferResponseType<T>;

export interface CaregiverProfile {
  first_name: string;
  last_names: string;
  phone: string;
  email: string;
  birth_date: string;
}
export interface AdminProfile {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
}
export interface PatientProfile {
  first_name: string;
  last_name: string;
}
export interface Me {
  id: string;
  role: Role;
  profile: Partial<CaregiverProfile & AdminProfile & PatientProfile> | null;
}

/** Nombre completo según el rol (cuidadores: apellidos; resto: apellido). */
export const fullName = (p: Me["profile"]): string =>
  p ? `${p.first_name ?? ""} ${p.last_names ?? p.last_name ?? ""}`.trim() : "";

export type Shift = Res<ApiClient["shifts"]["$get"]>["shifts"][number];
export type Patient = Res<ApiClient["me"]["patients"]["$get"]>["patients"][number];
export type TaskGroup = Res<ApiClient["tasks"]["$get"]>["patients"][number];
export type TaskItem = TaskGroup["tasks"][number];
export type WeeklyRow = Res<ApiClient["wellbeing"]["weekly"]["$get"]>["weeks"][number];
export type WellbeingRecord = Res<ApiClient["wellbeing"]["$get"]>["records"][number];
export interface IntervalReminder {
  on: boolean;
  freq: 30 | 60 | 120 | 180;
  from: string;
  to: string;
}
/** GET/PUT /reminders (el GET viene tipado como JSON suelto desde jsonb, por eso se declara acá). */
export interface ReminderSettings {
  water: IntervalReminder;
  stretch: IntervalReminder;
  relax: { on: boolean; times: string[] };
}
export type PatientToday = Res<ApiClient["patient"]["today"]["$get"]>;
export type AdminSummary = Res<ApiClient["admin"]["summary"]["$get"]>;
export type AdminCaregiver = Res<ApiClient["admin"]["caregivers"]["$get"]>["caregivers"][number];
export type AdminPatient = Res<ApiClient["admin"]["patients"]["$get"]>["patients"][number];
export type AdminAdmin = Res<ApiClient["admin"]["admins"]["$get"]>["admins"][number];
export type AdminDevice = Res<ApiClient["admin"]["devices"]["$get"]>["devices"][number];
export type MailLogRow = Res<ApiClient["admin"]["mail"]["log"]["$get"]>["log"][number];
export type ChatReply = Res<ApiClient["assistant"]["chat"]["$post"]>;
export type DeviceStatus = Res<ApiClient["device"]["status"]["$get"]>;
