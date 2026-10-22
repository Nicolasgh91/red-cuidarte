import type { Me } from "../api/types";
import { fullName } from "../api/types";
import { useDemoUsers } from "../api/queries/demo";
import { DEMO_ROLES, switchDemoUser } from "../auth/demo";
import { ROLES } from "../lib/labels";

/** Modo demo: con quién se está viendo la app y un selector para cambiar de usuario en un toque. */
export function DemoBar({ me }: { me: Me }) {
  const users = useDemoUsers();
  const name = fullName(me.profile) || "Sin nombre";
  const list = users.data ?? [{ id: me.id, role: me.role, name, email: null }];
  return (
    <div className="demo-bar" role="region" aria-label="Modo demo">
      <span>
        <b>Modo demo</b> · Estás como {name} ({ROLES[me.role]})
      </span>
      <label>
        Cambiar usuario
        <select value={me.id} onChange={(e) => switchDemoUser(e.target.value)}>
          {DEMO_ROLES.map((role) => {
            const group = list.filter((u) => u.role === role);
            if (!group.length) return null;
            return (
              <optgroup key={role} label={ROLES[role]}>
                {group.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
    </div>
  );
}
