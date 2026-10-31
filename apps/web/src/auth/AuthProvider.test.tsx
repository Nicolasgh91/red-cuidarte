import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, fakeApi, ok } from "../test/render";
import { AuthProvider } from "./AuthProvider";
import type { DeviceStore } from "./deviceStore";
import type { Passkeys } from "./deviceFlow";
import { AuthFlowError } from "./services";
import type { AuthServices } from "./services";
import { AuthGate } from "./screens";

function memoryStore(): DeviceStore {
  let token: string | null = null;
  let cred: [string, string] | null = null;
  return {
    getToken: () => token,
    setToken: (t) => (token = t),
    clearToken: () => (token = null),
    getCredential: (u) => (cred && cred[0] === u ? cred[1] : null),
    setCredential: (u, id) => (cred = [u, id]),
    clearCredential: () => (cred = null),
  };
}

function services(over: Partial<AuthServices> = {}): AuthServices {
  return {
    getSession: vi.fn(async () => null),
    onSignedOut: vi.fn(() => () => undefined),
    signIn: vi.fn(async () => ({ userId: "u1" })),
    sendRecoveryCode: vi.fn(async () => undefined),
    resetPassword: vi.fn(async () => ({ userId: "u1" })),
    signOut: vi.fn(async () => undefined),
    getAccessToken: vi.fn(async () => "jwt"),
    ...over,
  };
}

const passkeys: Passkeys = {
  register: vi.fn(async () => ({ id: "cred-1" })),
  login: vi.fn(async () => ({ id: "cred-1" })),
};

function deviceApi(over: { status?: unknown; registerOptions?: unknown; signup?: unknown } = {}) {
  return fakeApi({
    signup: { $post: over.signup ?? vi.fn(async () => ok({ id: "u1" })) },
    device: {
      status: {
        $get:
          over.status ??
          vi.fn(async () => ok({ registered: false, label: null, last_seen_at: null })),
      },
      register: {
        options: { $post: over.registerOptions ?? vi.fn(async () => ok({ challenge: "c" })) },
        verify: { $post: vi.fn(async () => ok({ device_token: "tok" })) },
      },
      login: {
        options: { $post: vi.fn(async () => ok({ challenge: "c" })) },
        verify: { $post: vi.fn(async () => ok({ device_token: "tok2" })) },
      },
    },
  });
}

function mount(svc: AuthServices, api = deviceApi(), store = memoryStore(), route = "/ingresar") {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider services={svc} store={store} passkeys={passkeys} apiOverride={api}>
          <AuthGate>
            <p>App lista</p>
          </AuthGate>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { store };
}

/** Completa el formulario de registro con datos válidos (salvo lo que se pise). */
async function fillRegister(
  user: ReturnType<typeof userEvent.setup>,
  over: { pass2?: string; role?: "caregiver" | "patient" } = {},
) {
  const role = over.role ?? "caregiver";
  await user.click(
    await screen.findByRole("radio", {
      name: role === "patient" ? /Soy paciente/ : /Soy cuidador/,
    }),
  );
  await user.type(screen.getByLabelText("Nombre"), "Sofía");
  if (role === "caregiver") {
    await user.type(screen.getByLabelText("Apellidos"), "Ejemplo");
    await user.type(screen.getByLabelText("Celular"), "342 155 000000");
    await user.type(screen.getByLabelText("Fecha de nacimiento"), "14/05/1980");
  } else {
    await user.type(screen.getByLabelText("Apellido"), "Ejemplo");
  }
  await user.type(screen.getByLabelText("Correo electrónico"), "Sofia@Ejemplo.org");
  await user.type(screen.getByLabelText("Contraseña"), "una-clave-larga");
  await user.type(screen.getByLabelText("Repetí la contraseña"), over.pass2 ?? "una-clave-larga");
}

describe("ingreso con mail y contraseña + dispositivo", () => {
  beforeEach(() => {
    vi.stubGlobal("PublicKeyCredential", class {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("la landing es la bienvenida y solo ofrece ingresar", async () => {
    mount(services(), deviceApi(), memoryStore(), "/");
    expect(await screen.findByRole("heading", { level: 1, name: "Cuidarte+" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ingresar/ })).toHaveAttribute("href", "/ingresar");
    expect(screen.queryByRole("link", { name: /Crear cuenta/ })).not.toBeInTheDocument();
  });

  it("el ingreso ofrece crear una cuenta", async () => {
    mount(services(), deviceApi(), memoryStore(), "/ingresar");
    expect(await screen.findByRole("link", { name: /No tenés cuenta/ })).toHaveAttribute(
      "href",
      "/registro",
    );
  });

  it("sin sesión, una ruta de la app lleva a ingresar", async () => {
    mount(services(), deviceApi(), memoryStore(), "/turnos");
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  });

  it("mail + contraseña → registra el dispositivo → app", async () => {
    const svc = services();
    const { store } = mount(svc);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "info@redasistir.online" })).toHaveAttribute(
      "href",
      "mailto:info@redasistir.online",
    );
    await user.type(screen.getByLabelText("Correo electrónico"), "Sofia@Ejemplo.org ");
    await user.type(screen.getByLabelText("Contraseña"), "una-clave");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(svc.signIn).toHaveBeenCalledWith("sofia@ejemplo.org", "una-clave");

    expect(await screen.findByText("App lista")).toBeInTheDocument();
    expect(store.getToken()).toBe("tok");
    expect(store.getCredential("u1")).toBe("cred-1");
  });

  it("muestra u oculta la contraseña", async () => {
    mount(services());
    const user = userEvent.setup();
    const input = await screen.findByLabelText("Contraseña");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("valida el mail y la contraseña antes de llamar a Supabase", async () => {
    const svc = services();
    mount(svc);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Correo electrónico"), "no-es-un-mail");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Revisá el mail");
    await user.clear(screen.getByLabelText("Correo electrónico"));
    await user.type(screen.getByLabelText("Correo electrónico"), "sofia@ejemplo.org");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribí tu contraseña");
    expect(svc.signIn).not.toHaveBeenCalled();
  });

  it("credenciales incorrectas: se queda en el ingreso con el error", async () => {
    const svc = services({
      signIn: vi.fn(async () => {
        throw new AuthFlowError("Mail o contraseña incorrectos.");
      }),
    });
    mount(svc);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Correo electrónico"), "sofia@ejemplo.org");
    await user.type(screen.getByLabelText("Contraseña"), "mal");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mail o contraseña incorrectos.");
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeEnabled();
  });

  it("registro: crea la cuenta en la API, inicia sesión y registra el dispositivo", async () => {
    const svc = services();
    const signup = vi.fn(async () => ok({ id: "u1" }));
    mount(svc, deviceApi({ signup }), memoryStore(), "/registro");
    const user = userEvent.setup();
    await fillRegister(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(signup).toHaveBeenCalledWith({
      json: {
        role: "caregiver",
        first_name: "Sofía",
        last_names: "Ejemplo",
        phone: "342 155 000000",
        birth_date: "1980-05-14",
        email: "sofia@ejemplo.org",
        password: "una-clave-larga",
      },
    });
    expect(svc.signIn).toHaveBeenCalledWith("sofia@ejemplo.org", "una-clave-larga");
    expect(await screen.findByText("App lista")).toBeInTheDocument();
  });

  it("registro de paciente: pide menos datos y manda el rol", async () => {
    const svc = services();
    const signup = vi.fn(async () => ok({ id: "u1" }));
    mount(svc, deviceApi({ signup }), memoryStore(), "/registro");
    const user = userEvent.setup();
    await fillRegister(user, { role: "patient" });
    expect(screen.queryByLabelText("Celular")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(signup).toHaveBeenCalledWith({
      json: {
        role: "patient",
        first_name: "Sofía",
        last_name: "Ejemplo",
        email: "sofia@ejemplo.org",
        password: "una-clave-larga",
      },
    });
    expect(await screen.findByText("App lista")).toBeInTheDocument();
  });

  it("registro: hay que elegir un rol", async () => {
    const signup = vi.fn(async () => ok({ id: "u1" }));
    mount(services(), deviceApi({ signup }), memoryStore(), "/registro");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByText("Elegí cómo vas a usar Cuidarte+.")).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it("registro: valida en el cliente y muestra el error de la API", async () => {
    const svc = services();
    const signup = vi.fn(async () => fail(409, "email_taken", "Ya hay una cuenta con ese mail."));
    mount(svc, deviceApi({ signup }), memoryStore(), "/registro");
    const user = userEvent.setup();
    await fillRegister(user, { pass2: "otra-clave" });
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(screen.getByText(/tenés que aceptar los términos/)).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Repetí la contraseña"));
    await user.type(screen.getByLabelText("Repetí la contraseña"), "una-clave-larga");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByText("Ya hay una cuenta con ese mail.")).toBeInTheDocument();
    expect(svc.signIn).not.toHaveBeenCalled();
  });

  it("primera vez / olvidé la contraseña: código por mail → contraseña nueva → dispositivo", async () => {
    const svc = services();
    mount(svc, deviceApi(), memoryStore(), "/recuperar");
    const user = userEvent.setup();
    expect(
      await screen.findByRole("heading", { name: "Definí tu contraseña" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Correo electrónico"), "sofia@ejemplo.org");
    await user.click(screen.getByRole("button", { name: /Enviarme el código/ }));
    expect(svc.sendRecoveryCode).toHaveBeenCalledWith("sofia@ejemplo.org");

    expect(await screen.findByRole("heading", { name: "Revisá tu mail" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.type(screen.getByLabelText("Contraseña nueva"), "una-clave-larga");
    await user.type(screen.getByLabelText("Repetí la contraseña"), "una-clave-larga");
    await user.click(screen.getByRole("button", { name: /Guardar e ingresar/ }));
    expect(svc.resetPassword).toHaveBeenCalledWith(
      "sofia@ejemplo.org",
      "123456",
      "una-clave-larga",
    );
    expect(await screen.findByText("App lista")).toBeInTheDocument();
  });

  it("código incorrecto: se queda en el paso del código con el error", async () => {
    const svc = services({
      resetPassword: vi.fn(async () => {
        throw new AuthFlowError("El código no es correcto o venció. Pedí uno nuevo.");
      }),
    });
    mount(svc, deviceApi(), memoryStore(), "/recuperar");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Correo electrónico"), "sofia@ejemplo.org");
    await user.click(screen.getByRole("button", { name: /Enviarme el código/ }));
    await user.type(await screen.findByLabelText("Código"), "000000");
    await user.type(screen.getByLabelText("Contraseña nueva"), "una-clave-larga");
    await user.type(screen.getByLabelText("Repetí la contraseña"), "una-clave-larga");
    await user.click(screen.getByRole("button", { name: /Guardar e ingresar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El código no es correcto");
    expect(screen.getByLabelText("Código")).toBeInTheDocument();
  });

  it("la cuenta ya tiene otro dispositivo: pantalla de bloqueo con el mensaje del servidor", async () => {
    const msg =
      "Tu cuenta ya está registrada en otro dispositivo. Pedile al administrador que la libere.";
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    mount(
      svc,
      deviceApi({
        status: vi.fn(async () => ok({ registered: true, label: "Otro", last_seen_at: null })),
        registerOptions: vi.fn(async () => fail(403, "device_blocked", msg)),
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Este dispositivo está bloqueado" }),
    ).toBeInTheDocument();
    expect(screen.getByText(msg)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "info@redasistir.online" })).toHaveAttribute(
      "href",
      "mailto:info@redasistir.online",
    );
    expect(screen.queryByText("App lista")).not.toBeInTheDocument();
  });

  it("sesión abierta con token de dispositivo: entra directo", async () => {
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    const store = memoryStore();
    store.setToken("guardado");
    mount(svc, deviceApi(), store);
    expect(await screen.findByText("App lista")).toBeInTheDocument();
  });

  it("si el navegador pide un gesto, ofrece el botón para verificar", async () => {
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    vi.mocked(passkeys.register).mockRejectedValueOnce(
      Object.assign(new Error("gesto"), { name: "NotAllowedError" }),
    );
    mount(svc);
    const button = await screen.findByRole("button", { name: "Registrar este dispositivo" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.setup().click(button);
    await waitFor(() => expect(screen.getByText("App lista")).toBeInTheDocument());
  });

  it("cerrar sesión desde la pantalla de dispositivo vuelve al inicio de sesión", async () => {
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    vi.mocked(passkeys.register).mockRejectedValueOnce(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    );
    mount(svc);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Cerrar sesión" }));
    expect(svc.signOut).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  });
});
