import { Navigate, Route, Routes } from "react-router";
import type { Role } from "./api/types";
import { HOME, VIEWS } from "./nav";
import { Articulo } from "./views/caregiver/Articulo";

/** Rutas de un rol. Cualquier ruta que no sea suya (o no exista) vuelve a su inicio. */
export function RoleRoutes({ role }: { role: Role }) {
  const views = VIEWS[role];
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/${HOME[role]}`} replace />} />
      {Object.entries(views).map(([path, View]) => (
        <Route key={path} path={`/${path}`} element={<View />} />
      ))}
      {role === "caregiver" && <Route path="/recursos/:id" element={<Articulo />} />}
      <Route path="*" element={<Navigate to={`/${HOME[role]}`} replace />} />
    </Routes>
  );
}
