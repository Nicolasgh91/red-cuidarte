import { errorMessage } from "../../api/errors";
import { useAdminDevices, useAuthorizeDevice, useReleaseDevice } from "../../api/queries/admin";
import type { AdminDevice } from "../../api/types";
import { Async } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { ago } from "../../lib/dates";
import { ROLES } from "../../lib/labels";

function DeviceRow({ d }: { d: AdminDevice }) {
  const release = useReleaseDevice();
  const authorize = useAuthorizeDevice();
  const { toast } = useToast();
  const status = d.blocked ? (
    <span className="pill bad">Intento bloqueado</span>
  ) : d.label ? (
    <span className="pill ok">Activo</span>
  ) : (
    <span className="pill warn">Sin dispositivo</span>
  );

  return (
    <tr>
      <td>
        <b style={{ color: "var(--ink)" }}>{d.name}</b>
        <br />
        <span className="optional">{ROLES[d.role]}</span>
      </td>
      <td>
        {d.label || "—"}
        {d.blocked && (
          <>
            <br />
            <span className="optional">Intentó: {d.blocked.label}</span>
          </>
        )}
      </td>
      <td className="n">
        {d.last_ip || "—"}
        {d.blocked && (
          <>
            <br />
            <span className="optional">{d.blocked.ip ?? "—"}</span>
          </>
        )}
      </td>
      <td className="n">{d.label && d.last_seen_at ? ago(d.last_seen_at) : "—"}</td>
      <td>{status}</td>
      <td>
        <div className="btn-row" style={{ flexWrap: "nowrap" }}>
          {d.blocked && (
            <button
              className="ghost"
              disabled={authorize.isPending}
              onClick={() =>
                authorize.mutate(d.id, {
                  onSuccess: () =>
                    toast("Nuevo dispositivo autorizado. El anterior quedó sin acceso."),
                  onError: (e) => toast(errorMessage(e)),
                })
              }
            >
              Autorizar el nuevo
            </button>
          )}
          {d.label && (
            <button
              className="ghost"
              disabled={release.isPending}
              onClick={() =>
                release.mutate(d.id, {
                  onSuccess: () =>
                    toast("Dispositivo liberado. Se registra uno nuevo en el próximo ingreso."),
                  onError: (e) => toast(errorMessage(e)),
                })
              }
            >
              Liberar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function AdminDispositivos() {
  const q = useAdminDevices();
  return (
    <div className="page wide">
      <div className="head">
        <h1>Dispositivos</h1>
        <p className="sub">Cada cuenta entra desde un solo dispositivo.</p>
      </div>
      <Async query={q}>
        {(list) => (
          <div className="card tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Dispositivo</th>
                  <th>Última IP</th>
                  <th>Último acceso</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <DeviceRow key={d.id} d={d} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      <div className="privacy">
        <Icon name="shield" />
        <p>
          El dispositivo se reconoce por una credencial que queda guardada en él al primer ingreso.
          La IP se guarda solo como registro: cambia seguido en datos móviles y wifi, así que no
          sirve para identificar el equipo. Los navegadores no permiten leer la dirección MAC.
          «Liberar» deja la cuenta lista para registrar un dispositivo nuevo en el próximo ingreso.
        </p>
      </div>
    </div>
  );
}
