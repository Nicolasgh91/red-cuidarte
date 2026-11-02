import { describe, expect, it, vi } from "vitest";
import { TEST_ENV } from "./harness.js";
import { MailError, classifyMailError, createSmtpMailer } from "../src/services/mailer.js";

const coded = (code: string, extra: object = {}) =>
  Object.assign(new Error(`${code} boom`), { code, ...extra });

describe("classifyMailError", () => {
  it.each([
    ["EBUSY", "dns"],
    ["ENOTFOUND", "dns"],
    ["EAI_AGAIN", "dns"],
    ["ECONNREFUSED", "connect"],
    ["ECONNRESET", "connect"],
    ["ETIMEDOUT", "timeout"],
    ["EAUTH", "auth"],
    ["ESTREAM", "tls"],
    ["EENVELOPE", "rejected"],
  ])("%s → %s", (code, kind) => {
    expect(classifyMailError(coded(code), "smtp.test").kind).toBe(kind);
  });

  it("el error de la prueba real: getaddrinfo EBUSY demo", () => {
    const e = classifyMailError(coded("EBUSY"), "demo");
    expect(e.kind).toBe("dns");
    expect(e.message).toContain("«demo»");
    expect(e.message).toContain("SMTP_HOST");
  });

  it("usa el código de respuesta SMTP cuando no hay code", () => {
    expect(classifyMailError({ message: "535 mal", responseCode: 535 }, "h").kind).toBe("auth");
    expect(classifyMailError({ message: "550 no", responseCode: 550 }, "h").kind).toBe("rejected");
  });

  it("lo que no reconoce queda como unknown con su mensaje", () => {
    const e = classifyMailError(new Error("algo raro"), "h");
    expect(e).toMatchObject({ kind: "unknown", message: "algo raro" });
  });
});

describe("createSmtpMailer", () => {
  const msg = { to: "a@example.org", subject: "s", text: "t" };

  it("manda con el remitente configurado", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await createSmtpMailer(TEST_ENV, { sendMail }, 0).send({ ...msg, replyTo: "r@example.org" });
    expect(sendMail).toHaveBeenCalledWith({
      from: TEST_ENV.SMTP_FROM,
      ...msg,
      replyTo: "r@example.org",
    });
  });

  it("reintenta una vez si el lookup falla de forma pasajera", async () => {
    const sendMail = vi.fn().mockRejectedValueOnce(coded("EBUSY")).mockResolvedValue({});
    await createSmtpMailer(TEST_ENV, { sendMail }, 0).send(msg);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("no reintenta un host que no existe y lanza MailError sin filtrar la clave", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const env = { ...TEST_ENV, SMTP_PASS: "s3cr3t-clave" };
    const sendMail = vi.fn().mockRejectedValue(coded("ENOTFOUND"));
    const e = await createSmtpMailer(env, { sendMail }, 0)
      .send(msg)
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MailError);
    expect((e as MailError).kind).toBe("dns");
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(err.mock.calls)).not.toContain(env.SMTP_PASS);
    expect(err).toHaveBeenCalledWith(
      "mail",
      expect.objectContaining({ kind: "dns", host: "smtp.test" }),
    );
    err.mockRestore();
  });
});
