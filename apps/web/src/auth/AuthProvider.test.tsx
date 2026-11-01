import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, fakeApi, ok } from "../test/render";
import { AuthProvider, useApi } from "./AuthProvider";
import { deviceStore } from "./deviceStore";
import * as svc from "./services";
import { AuthFlowError } from "./services";
import { AuthGate } from "./screens";

vi.mock("./services", async (importOriginal) => ({
  ...(await importOriginal<typeof svc>()),
  getSession: vi.fn(),
  onSignedOut: vi.fn(),
  signIn: vi.fn(),
  sendRecoveryCode: vi.fn(),
  resetPassword: vi.fn(),
  signOut: vi.fn(),
  getAccessToken: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

type Services = Omit<typeof svc, "AuthFlowError">;

/** Supabase simulado: sin sesión salvo que el test diga otra cosa. */
function services(over: Partial<{ [K in keyof Services]: Services[K] }> = {}): typeof svc {
  const impl: { [K in keyof Services]: Services[K] } = {
    getSession: async () => null,
    onSignedOut: () => () => undefined,
    signIn: async () => ({ userId: "u1" }),
    sendRecoveryCode: async () => undefined,
    resetPassword: async () => ({ userId: "u1" }),
    signOut: async () => undefined,
    getAccessToken: async () => "jwt",
    ...over,
  };
  for (const [k, fn] of Object.entries(impl)) {
    vi.mocked(svc[k as keyof Services]).mockImplementation(fn as never);
  }
  return svc;
}

/** Las ceremonias del navegador (@simplewebauthn/browser). */
const passkeys = {
  register: vi.mocked(startRegistration),
  login: vi.mocked(startAuthentication),
};

const status = (registered: boolean, verified: boolean) =>
  vi.fn(async () => ok({ registered, verified, label: null, last_seen_at: null }));

function deviceApi(
  over: { status?: unknown; registerOptions?: unknown; signup?: unknown; logout?: unknown } = {},
) {
  return fakeApi({
    signup: { $post: over.signup ?? vi.fn(async () => ok({ id: "u1" })) },
    logout: { $post: over.logout ?? vi.fn(async () => ok({ ok: true })) },
    device: {
      status: { $get: over.status ?? status(false, false) },
      register: {
        options: { $post: over.registerOptions ?? vi.fn(async () => ok({ challenge: "c" })) },
        verify: { $post: vi.fn(async () => ok({ ok: true })) },
      },
      login: {
        options: { $post: vi.fn(async () => ok({ challenge: "c" })) },
        verify: { $post: vi.fn(async () => ok({ ok: true })) },
      },
    },
  });
}

// `services()` ya dejó configurado Supabase: se recibe solo para que cada test lo lea en orden.
function mount(_svc: typeof svc, api = deviceApi(), route = "/ingresar") {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider apiOverride={api}>
          <AuthGate>
            <p>App lista</p>
          </AuthGate>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
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

describe("ingreso con mail y contraseña + passkey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    passkeys.register.mockResolvedValue({ id: "cred-1" } as never);
    passkeys.login.mockResolvedValue({ id: "cred-1" } as never);
  });

  it("la landing es la bienvenida y solo ofrece ingresar", async () => {
    mount(services(), deviceApi(), "/");
    expect(await screen.findByRole("heading", { level: 1, name: "Cuidarte+" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ingresar/ })).toHaveAttribute("href", "/ingresar");
    expect(screen.queryByRole("link", { name: /Crear cuenta/ })).not.toBeInTheDocument();
  });

  it("el ingreso ofrece crear una cuenta", async () => {
    mount(services(), deviceApi(), "/ingresar");
    expect(await screen.findByRole("link", { name: /No tenés cuenta/ })).toHaveAttribute(
      "href",
      "/registro",
    );
  });

  it("sin sesión, una ruta de la app lleva a ingresar", async () => {
    mount(services(), deviceApi(), "/turnos");
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  });

  it("mail + contraseña → registra la passkey → app", async () => {
    const svc = services();
    mount(svc);
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
    // en la web el token queda en la cookie HttpOnly: acá solo la pista
    expect(deviceStore.getToken()).toBeNull();
    expect(deviceStore.isVerified("u1")).toBe(true);
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

  it("registro: crea la cuenta en la API, inicia sesión y registra la passkey", async () => {
    const svc = services();
    const signup = vi.fn(async () => ok({ id: "u1" }));
    mount(svc, deviceApi({ signup }), "/registro");
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
    mount(svc, deviceApi({ signup }), "/registro");
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
    mount(services(), deviceApi({ signup }), "/registro");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByText("Elegí cómo vas a usar Cuidarte+.")).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it("registro: valida en el cliente y muestra el error de la API", async () => {
    const svc = services();
    const signup = vi.fn(async () => fail(409, "email_taken", "Ya hay una cuenta con ese mail."));
    mount(svc, deviceApi({ signup }), "/registro");
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

  it("primera vez / olvidé la contraseña: código por mail → contraseña nueva → passkey", async () => {
    const svc = services();
    mount(svc, deviceApi(), "/recuperar");
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
    mount(svc, deviceApi(), "/recuperar");
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

  it("la cuenta ya tiene passkey: la pide (no registra otra) y, si no está acá, sugiere el QR", async () => {
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    const notHere = Object.assign(new Error("x"), { name: "NotAllowedError" });
    vi.mocked(passkeys.login).mockRejectedValueOnce(notHere).mockRejectedValueOnce(notHere);
    mount(svc, deviceApi({ status: status(true, false) }));
    const button = await screen.findByRole("button", { name: "Verificar con mi passkey" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // el intento automático no muestra error
    await userEvent.setup().click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(/código QR/);
    expect(passkeys.register).not.toHaveBeenCalled();
    expect(screen.queryByText("App lista")).not.toBeInTheDocument();
  });

  it("sesión abierta y passkey ya verificada en este equipo: entra directo", async () => {
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    deviceStore.setVerified("u1");
    const api = deviceApi();
    mount(svc, api);
    expect(await screen.findByText("App lista")).toBeInTheDocument();
    expect(api.device.status.$get).not.toHaveBeenCalled();
  });

  it("sin la pista pero con la cookie vigente: entra sin pedir la passkey", async () => {
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    mount(svc, deviceApi({ status: status(true, true) }));
    expect(await screen.findByText("App lista")).toBeInTheDocument();
    expect(passkeys.login).not.toHaveBeenCalled();
    expect(deviceStore.isVerified("u1")).toBe(true);
  });

  it("si el navegador pide un gesto, ofrece el botón para verificar", async () => {
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    vi.mocked(passkeys.register).mockRejectedValueOnce(
      Object.assign(new Error("gesto"), { name: "NotAllowedError" }),
    );
    mount(svc);
    const button = await screen.findByRole("button", { name: "Crear mi passkey" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.setup().click(button);
    await waitFor(() => expect(screen.getByText("App lista")).toBeInTheDocument());
  });

  it("cerrar sesión espera a que la API borre la cookie y recién después vuelve al ingreso", async () => {
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    vi.mocked(passkeys.register).mockRejectedValueOnce(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    );
    let done!: (v: unknown) => void;
    const logout = vi.fn(() => new Promise((r) => (done = r)));
    deviceStore.setToken("nativo");
    mount(svc, deviceApi({ logout }));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Cerrar sesión" }));
    expect(svc.signOut).toHaveBeenCalled();
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    // mientras la API no confirma, la sesión local sigue
    expect(screen.queryByRole("heading", { name: "Ingresar" })).not.toBeInTheDocument();
    expect(deviceStore.getToken()).toBe("nativo");
    done(ok({ ok: true }));
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
    expect(deviceStore.getToken()).toBeNull();
  });

  it("si la API no responde al cerrar sesión, igual se cierra la sesión local", async () => {
    const svc = services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    vi.mocked(passkeys.register).mockRejectedValueOnce(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    );
    mount(svc, deviceApi({ logout: vi.fn(async () => Promise.reject(new TypeError("red"))) }));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  });
});

describe("re-ingreso con passkey ante un 403 device_login_required", () => {
  /** API simulada por `fetch`: así se prueba el cliente real con su manejo de 403. */
  function fakeServer(meStatuses: number[]) {
    const calls: string[] = [];
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      calls.push(path);
      if (path === "/me") {
        const st = meStatuses.shift() ?? 200;
        return st === 200
          ? json(200, { id: "u1", role: "caregiver", profile: null })
          : json(st, { error: { code: "device_login_required", message: "Verificá tu passkey." } });
      }
      if (path === "/device/status")
        return json(200, { registered: true, verified: false, label: null, last_seen_at: null });
      if (path === "/device/login/options") return json(200, { challenge: "c" });
      return json(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    return { calls };
  }

  /** Captura el cliente de la API para pedir desde el test, aunque la app no esté montada. */
  let api: ReturnType<typeof useApi>;
  function Grab() {
    api = useApi();
    return <p>App lista</p>;
  }
  const mountReal = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/inicio"]}>
          <AuthProvider>
            <AuthGate>
              <Grab />
            </AuthGate>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    services({ getSession: vi.fn(async () => ({ userId: "u1" })) });
    deviceStore.setVerified("u1"); // entra directo: el token vence después
  });
  afterEach(() => vi.unstubAllGlobals());

  it("dos pedidos simultáneos comparten un solo re-ingreso y se reintentan una vez", async () => {
    const { calls } = fakeServer([403, 403]);
    passkeys.login.mockResolvedValue({ id: "cred-1" } as never);
    mountReal();
    await screen.findByText("App lista");
    const [a, b] = await Promise.all([api.me.$get(), api.me.$get()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(passkeys.login).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c === "/device/login/verify")).toHaveLength(1);
    expect(calls.filter((c) => c === "/me")).toHaveLength(4);
    expect(screen.getByText("App lista")).toBeInTheDocument();
  });

  it("si el intento automático falla, pide un gesto y no reintenta solo (sin bucle)", async () => {
    fakeServer([403, 403, 403, 403]);
    const gesture = Object.assign(new Error("gesto"), { name: "NotAllowedError" });
    passkeys.login.mockRejectedValueOnce(gesture);
    mountReal();
    await screen.findByText("App lista");

    expect((await api.me.$get()).status).toBe(403);
    const button = await screen.findByRole("button", { name: "Verificar con mi passkey" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(passkeys.login).toHaveBeenCalledTimes(1);

    // Mientras espera el gesto, otros 403 no abren otra ceremonia.
    await Promise.all([api.me.$get(), api.me.$get()]);
    expect(passkeys.login).toHaveBeenCalledTimes(1);

    // Con el botón (gesto de la persona) se verifica y vuelve a la app.
    passkeys.login.mockResolvedValueOnce({ id: "cred-1" } as never);
    await userEvent.setup().click(button);
    expect(await screen.findByText("App lista")).toBeInTheDocument();
    expect(passkeys.login).toHaveBeenCalledTimes(2);
  });
});
