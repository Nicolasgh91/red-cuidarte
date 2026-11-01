import { errorMessage } from "../../api/errors";
import { useAdminDevices, useResetPasskey } from "../../api/queries/admin";
import type { AdminDevice } from "../../api/types";
import { Async } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { ago } from "../../lib/dates";
import { ROLES } from "../../lib/labels";

const EVENTS: Record<string, string> = {
  registered: "Registró la passkey",
  verified: "Ingresó",
  rejected: "Intentó registrar otra",
  reauth: "Confirmó una acción",
  reset: "Passkey restablecida",
};

function PasskeyRow({ d }: { d: AdminDevice }) {
  const reset = useResetPasskey();
  const { toast } = useToast();
  return (
    <tr>
      <td>
        <b style={{ color: "var(--ink)" }}>{d.name}</b>
        <br />
        <span className="optional">{ROLES[d.role]}</span>
      </td>
      <td>
        {d.label || "—"}
        {d.label && (d.device_type === "multiDevice" || d.backed_up) && (
          <>
            <br />
            {d.device_type === "multiDevice" && (
              <span className="pill neutral">Sincronizable</span>
            )}{" "}
            {d.backed_up && <span className="pill neutral">Con respaldo</span>}
          </>
        )}
      </td>
      <td className="n">{d.last_ip || "—"}</td>
      <td className="n">{d.label && d.last_seen_at ? ago(d.last_seen_at) : "—"}</td>
      <td>
        {d.label ? (
          <span className="pill ok">Activa</span>
        ) : (
          <span className="pill warn">Sin passkey</span>
        )}
      </td>
      <td>
        {d.events.length ? (
          <ul className="optional" style={{ margin: 0, paddingLeft: "1em" }}>
            {d.events.map((e) => (
              <li key={`${e.kind}-${e.at}`}>
                {EVENTS[e.kind] ?? e.kind} · {ago(e.at)}
                {e.ip ? ` · IP ${e.ip}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          "—"
        )}
      </td>
      <td>
        {d.label && (
          <button
            className="ghost"
            disabled={reset.isPending}
            onClick={() =>
              reset.mutate(d.id, {
                onSuccess: () =>
                  toast("Passkey restablecida. Se registra una nueva en el próximo ingreso."),
                onError: (e) => toast(errorMessage(e)),
              })
            }
          >
            Restablecer passkey
          </button>
        )}
      </td>
    </tr>
  );
}

export function AdminDispositivos() {
  const q = useAdminDevices();
  return (
    <div className="page wide">
      <div className="head">
        <h1>Passkeys</h1>
        <p className="sub">
          Cada cuenta entra con su passkey, desde el equipo donde esté guardada.
        </p>
      </div>
      <Async query={q}>
        {(list) => (
          <div className="card tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Passkey</th>
                  <th>Última IP</th>
                  <th>Último uso</th>
                  <th>Estado</th>
                  <th>Actividad reciente</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <PasskeyRow key={d.id} d={d} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      <div className="privacy">
        <Icon name="shield" />
        <p>
          La passkey se crea en el primer ingreso y se desbloquea con huella, rostro o el bloqueo de
          pantalla. Si está guardada en Google o iCloud («Sincronizable») sirve en los otros equipos
          de esa persona; también puede usar su teléfono con el código QR. La IP se guarda solo como
          registro. «Restablecer passkey» deja la cuenta lista para registrar una nueva en el
          próximo ingreso; te pide confirmar con tu propia passkey.
        </p>
      </div>
    </div>
  );
}
