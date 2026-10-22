import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, fakeApi, ok } from "../test/render";
import { AuthProvider } from "./AuthProvider";
import type { DeviceStore } from "./deviceStore";
import type { Passkeys } from "./deviceFlow";
import { AuthFlowError, NOT_REGISTERED_MESSAGE } from "./services";
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
    sendCode: vi.fn(async () => undefined),
    verifyCode: vi.fn(async () => ({ userId: "u1" })),
    signOut: vi.fn(async () => undefined),
    getAccessToken: vi.fn(async () => "jwt"),
    ...over,
  };
}

const passkeys: Passkeys = {
  register: vi.fn(async () => ({ id: "cred-1" })),
  login: vi.fn(async () => ({ id: "cred-1" })),
};

function deviceApi(over: { status?: unknown; registerOptions?: unknown } = {}) {
  return fakeApi({
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

function mount(svc: AuthServices, api = deviceApi(), store = memoryStore()) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <AuthProvider services={svc} store={store} passkeys={passkeys} apiOverride={api}>
        <AuthGate>
          <p>App lista</p>
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { store };
}

describe("ingreso con código por mail + dispositivo", () => {
  beforeEach(() => {
    vi.stubGlobal("PublicKeyCredential", class {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mail → código → registra el dispositivo → app", async () => {
    const svc = services();
    const { store } = mount(svc);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Ingresá a Cuidarte+" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Mail"), "sofia@ejemplo.org");
    await user.click(screen.getByRole("button", { name: /Enviarme el código/ }));
    expect(svc.sendCode).toHaveBeenCalledWith("sofia@ejemplo.org");

    expect(await screen.findByRole("heading", { name: "Revisá tu mail" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(svc.verifyCode).toHaveBeenCalledWith("sofia@ejemplo.org", "123456");

    expect(await screen.findByText("App lista")).toBeInTheDocument();
    expect(store.getToken()).toBe("tok");
    expect(store.getCredential("u1")).toBe("cred-1");
  });

  it("valida el mail antes de pedir el código", async () => {
    const svc = services();
    mount(svc);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Mail"), "no-es-un-mail");
    await user.click(screen.getByRole("button", { name: /Enviarme el código/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Revisá el mail");
    expect(svc.sendCode).not.toHaveBeenCalled();
  });

  it("cuenta que no está dada de alta: muestra el mensaje de Supabase traducido", async () => {
    const svc = services({
      sendCode: vi.fn(async () => {
        throw new AuthFlowError(NOT_REGISTERED_MESSAGE);
      }),
    });
    mount(svc);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Mail"), "otra@ejemplo.org");
    await user.click(screen.getByRole("button", { name: /Enviarme el código/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_REGISTERED_MESSAGE);
  });

  it("código incorrecto: se queda en la pantalla del código con el error", async () => {
    const svc = services({
      verifyCode: vi.fn(async () => {
        throw new AuthFlowError("El código no es correcto o venció. Pedí uno nuevo.");
      }),
    });
    mount(svc);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Mail"), "sofia@ejemplo.org");
    await user.click(screen.getByRole("button", { name: /Enviarme el código/ }));
    await user.type(await screen.findByLabelText("Código"), "000000");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
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
    expect(await screen.findByRole("heading", { name: "Ingresá a Cuidarte+" })).toBeInTheDocument();
  });
});
