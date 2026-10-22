import { useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router";
import type { Me } from "../api/types";
import { fullName } from "../api/types";
import { RoleRoutes } from "../RoleRoutes";
import { HOME, NAV, sectionOf } from "../nav";
import { ROLES } from "../lib/labels";
import { DEMO_MODE } from "../auth/demo";
import { AccountMenu } from "./AccountMenu";
import { DemoBar } from "./DemoBar";
import { Icon, Logo } from "./icons";

/** Encabezado + navegación lateral (barra inferior en el celular) + contenido del rol. */
export function AppShell({ me }: { me: Me }) {
  const { pathname } = useLocation();
  const role = me.role;
  const nav = NAV[role];
  const section = sectionOf(pathname);
  const bare = section === "terminos";

  useEffect(() => window.scrollTo(0, 0), [pathname]);

  return (
    <div className={`shell${bare ? " bare" : ""}`}>
      {DEMO_MODE && <DemoBar me={me} />}
      <header className="top">
        <Link className="logo" to={`/${HOME[role]}`} aria-label="Cuidarte+, ir al inicio">
          <Logo />
          Cuidarte+
        </Link>
        <AccountMenu role={role} name={fullName(me.profile)} />
      </header>
      <aside className="side">
        <nav
          aria-label="Secciones"
          style={{ "--n": nav.filter((n) => n.mobile).length } as React.CSSProperties}
        >
          {nav.map((n) => (
            <NavLink
              key={n.path}
              to={`/${n.path}`}
              className={`nav-link${section === n.path ? " on" : ""}`}
              {...(n.mobile ? { "data-m": "" } : {})}
              aria-current={section === n.path ? "page" : undefined}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="role-tag">Viendo como: {ROLES[role]}</p>
      </aside>
      <main id="main" tabIndex={-1}>
        <RoleRoutes role={role} />
      </main>
    </div>
  );
}
