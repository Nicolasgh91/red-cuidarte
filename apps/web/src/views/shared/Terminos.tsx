import { GoBack } from "../../components/common";
import { DISCLAIMER } from "../../lib/labels";

export function Terminos() {
  return (
    <div className="page narrow" style={{ maxWidth: 668 }}>
      <GoBack fallback="/" />
      <h1>Términos y privacidad</h1>
      <p className="note">
        Texto provisorio. Los términos definitivos deben ser revisados por un profesional legal
        antes del lanzamiento.
      </p>
      <div className="prose">
        <h2>Qué datos pedimos</h2>
        <p>
          Para cuidadores: nombre, apellidos, mail, celular y fecha de nacimiento. Para personas
          cuidadas: nombre, apellido y medicación. Los administradores se cargan directamente en el
          sistema.
        </p>
        <h2>Tu registro de bienestar</h2>
        <p>
          Cómo te sentís es información sensible según la Ley 25.326. Tus registros los ves solo
          vos: ni el administrador ni el asistente acceden a ellos.
        </p>
        <h2>Datos de salud de la persona cuidada</h2>
        <p>
          La medicación es un dato de salud. Solo la ven el administrador y los cuidadores asignados
          a esa persona, y se carga con el consentimiento de la persona cuidada o de quien la
          represente.
        </p>
        <h2>Un dispositivo por cuenta</h2>
        <p>
          Cada cuenta se usa desde un solo dispositivo. Guardamos qué dispositivo es y la última
          dirección IP de acceso para proteger tu cuenta. Para cambiar de dispositivo, el
          administrador libera la cuenta.
        </p>
        <h2>Recordatorios y mails</h2>
        <p>
          Los recordatorios son opcionales. Usamos tu fecha de nacimiento para mandarte un saludo
          por mail en tu cumpleaños.
        </p>
        <h2>Asistente</h2>
        <p>
          El asistente responde con los recursos de la app, preguntas frecuentes, tus turnos y la
          medicación de tus pacientes. No ve tu registro de bienestar.
        </p>
        <h2>Tus derechos</h2>
        <p>Podés ver y corregir tus datos en Mi perfil, y borrar tu cuenta con todos tus datos.</p>
      </div>
      <p className="disclaimer">{DISCLAIMER}</p>
    </div>
  );
}
