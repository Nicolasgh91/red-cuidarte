import { useEffect } from "react";
import { Link } from "react-router";
import { Logo } from "../../components/icons";
import { DISCLAIMER } from "../../lib/labels";

/**
 * Política de privacidad pública (https://redasistir.online/privacidad).
 * BORRADOR: debe revisarlo un profesional legal (Ley 25.326) antes de publicar la app (roadmap F10).
 */
export function Privacidad() {
  useEffect(() => {
    document.title = "Política de privacidad · Cuidarte+";
  }, []);
  return (
    <div className="shell bare">
      <header className="top">
        <Link to="/" className="logo">
          <Logo />
          Cuidarte+
        </Link>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page narrow" style={{ maxWidth: 668 }}>
          <h1>Política de privacidad</h1>
          <p className="note">
            Texto provisorio. La política definitiva debe ser revisada por un profesional legal
            antes del lanzamiento.
          </p>
          <div className="prose">
            <h2>Quién es responsable</h2>
            <p>
              Cuidarte+ es una aplicación de Red Cuidar. Para consultas sobre tus datos escribí a la
              casilla de contacto que figure en la ficha de la app.
            </p>
            <h2>Qué datos guardamos</h2>
            <p>
              Cuidadores: nombre, apellidos, mail, celular y fecha de nacimiento; sus turnos, las
              tareas que tildan, su configuración de recordatorios y los registros de bienestar.
              Personas cuidadas: nombre, apellido y medicación (nombre, dosis y horarios).
              Administradores: nombre, apellido, mail y celular. Para proteger cada cuenta también
              guardamos una credencial del dispositivo (passkey), su descripción, la última
              dirección IP de acceso y los intentos de ingreso desde otros dispositivos.
            </p>
            <h2>Datos de salud</h2>
            <p>
              La medicación y los registros de bienestar son datos de salud, considerados sensibles
              por la Ley 25.326. La medicación solo la ven los administradores y los cuidadores
              asignados a esa persona, y se carga con el consentimiento de la persona cuidada o de
              quien la represente; se guarda cifrada. Los registros de bienestar los ve únicamente
              el cuidador que los hizo: ni los administradores ni el asistente acceden a ellos.
            </p>
            <h2>Para qué los usamos</h2>
            <p>
              Para que la app funcione: mostrar turnos y tareas, armar el checklist de medicación,
              enviarte recordatorios que vos configurás, saludarte por mail en tu cumpleaños y
              permitir que cada cuenta se use desde un solo dispositivo.
            </p>
            <h2>Asistente</h2>
            <p>
              Cuando le escribís al asistente, tu mensaje y la conversación en curso se envían a
              Groq, el proveedor del modelo de lenguaje, junto con información de la app para poder
              responder: preguntas frecuentes, recursos, tus pacientes asignados, su medicación y
              tus turnos. No enviamos tu registro de bienestar. Cuidarte+ no guarda las
              conversaciones. No des diagnósticos ni cambies medicación según lo que diga el
              asistente: consultá a un profesional.
            </p>
            <h2>Con quién se comparten</h2>
            <p>
              No vendemos datos. Usamos proveedores que los procesan por nuestra cuenta: Supabase
              (base de datos y autenticación), Vercel (alojamiento), el proveedor de correo de la
              casilla de avisos y Groq (asistente).
            </p>
            <h2>Ubicación</h2>
            <p>
              La app no recopila ni guarda tu ubicación. El botón de urgencia abre el marcador del
              teléfono con el número de emergencias.
            </p>
            <h2>Recordatorios</h2>
            <p>
              En la app de Android los recordatorios son notificaciones locales programadas en tu
              dispositivo; la app te pide permiso para mostrarlas.
            </p>
            <h2>Cuánto tiempo y tus derechos</h2>
            <p>
              Podés ver y corregir tus datos en Mi perfil y borrar tu cuenta con todos tus datos
              desde Mi perfil › Borrar mi cuenta. Los administradores pueden pedir la baja de las
              personas cuidadas que cargaron. Para ejercer tus derechos de acceso, rectificación y
              supresión también podés escribirnos.
            </p>
            <p>
              La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326,
              recibe las denuncias y reclamos por incumplimiento de las normas de protección de
              datos personales.
            </p>
          </div>
          <p className="disclaimer">{DISCLAIMER}</p>
        </div>
      </main>
    </div>
  );
}
