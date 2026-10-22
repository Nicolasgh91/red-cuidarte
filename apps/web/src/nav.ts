import type { ComponentType } from "react";
import type { IconName } from "./components/icons";
import type { Role } from "./api/types";
import { Acerca } from "./views/shared/Acerca";
import { Terminos } from "./views/shared/Terminos";
import { Admin } from "./views/admin/Admin";
import { AdminCaregivers } from "./views/admin/AdminCaregivers";
import { AdminCorreos } from "./views/admin/AdminCorreos";
import { AdminDispositivos } from "./views/admin/AdminDispositivos";
import { AdminPacientes } from "./views/admin/AdminPacientes";
import { Asistente } from "./views/caregiver/Asistente";
import { Bienestar } from "./views/caregiver/Bienestar";
import { Inicio } from "./views/caregiver/Inicio";
import { Pausa } from "./views/caregiver/Pausa";
import { Perfil } from "./views/caregiver/Perfil";
import { Recordatorios } from "./views/caregiver/Recordatorios";
import { Recursos } from "./views/caregiver/Recursos";
import { Tareas } from "./views/caregiver/Tareas";
import { Turnos } from "./views/caregiver/Turnos";
import { Hoy } from "./views/patient/Hoy";

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  /** Aparece en la barra inferior del celular. */
  mobile?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  caregiver: [
    { path: "inicio", label: "Inicio", icon: "home", mobile: true },
    { path: "turnos", label: "Turnos", icon: "calendar", mobile: true },
    { path: "tareas", label: "Tareas", icon: "list", mobile: true },
    { path: "asistente", label: "Asistente", icon: "sparkle", mobile: true },
    { path: "bienestar", label: "Bienestar", icon: "sun", mobile: true },
    { path: "pausa", label: "Pausa", icon: "pause" },
    { path: "recursos", label: "Recursos", icon: "search" },
  ],
  admin: [
    { path: "admin", label: "Panel", icon: "grid", mobile: true },
    { path: "admin-cuidadores", label: "Cuidadores", icon: "users", mobile: true },
    { path: "admin-pacientes", label: "Pacientes", icon: "heart", mobile: true },
    { path: "admin-dispositivos", label: "Dispositivos", icon: "phone", mobile: true },
    { path: "admin-correos", label: "Correos", icon: "mail", mobile: true },
  ],
  patient: [{ path: "paciente", label: "Hoy", icon: "home", mobile: true }],
};

export const HOME: Record<Role, string> = {
  caregiver: "inicio",
  admin: "admin",
  patient: "paciente",
};

export const VIEWS: Record<Role, Record<string, ComponentType>> = {
  caregiver: {
    inicio: Inicio,
    recursos: Recursos,
    pausa: Pausa,
    bienestar: Bienestar,
    perfil: Perfil,
    recordatorios: Recordatorios,
    turnos: Turnos,
    tareas: Tareas,
    asistente: Asistente,
    acerca: Acerca,
    terminos: Terminos,
  },
  admin: {
    admin: Admin,
    "admin-cuidadores": AdminCaregivers,
    "admin-pacientes": AdminPacientes,
    "admin-dispositivos": AdminDispositivos,
    "admin-correos": AdminCorreos,
    acerca: Acerca,
    terminos: Terminos,
  },
  patient: { paciente: Hoy, acerca: Acerca, terminos: Terminos },
};

/** Sección de la barra de navegación que corresponde a una ruta. */
export function sectionOf(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  return seg === "recordatorios" ? "pausa" : seg;
}
