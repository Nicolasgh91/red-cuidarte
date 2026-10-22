import { describe, expect, it, vi } from "vitest";
import { createRecyclingSql, type Sql } from "../src/db.js";

/** Fábrica de clientes falsos: cada uno con su end() espiado. */
function setup(staleMs = 30_000) {
  let t = 1_000_000;
  const clients: { end: ReturnType<typeof vi.fn> }[] = [];
  const create = vi.fn(() => {
    const client = { end: vi.fn(() => Promise.resolve()) };
    clients.push(client);
    return client as unknown as Sql;
  });
  const pool = createRecyclingSql("postgres://falsa", { staleMs, now: () => t, create });
  return { pool, create, clients, advance: (ms: number) => void (t += ms) };
}

describe("createRecyclingSql", () => {
  it("reusa la conexión dentro de la ventana", () => {
    const { pool, create, clients, advance } = setup();
    const a = pool.get();
    pool.release();
    advance(29_000);
    const b = pool.get();
    pool.release();
    expect(b).toBe(a);
    expect(create).toHaveBeenCalledTimes(1);
    expect(clients[0]!.end).not.toHaveBeenCalled();
  });

  it("vencida la ventana y sin pedidos en curso, crea otra y cierra la vieja", () => {
    const { pool, create, clients, advance } = setup();
    const a = pool.get();
    pool.release();
    advance(31_000);
    const b = pool.get();
    expect(b).not.toBe(a);
    expect(create).toHaveBeenCalledTimes(2);
    expect(clients[0]!.end).toHaveBeenCalledWith({ timeout: 0 });
    expect(clients[1]!.end).not.toHaveBeenCalled();
  });

  it("3 get() seguidos tras la ventana: un solo create y la nueva no se cierra", () => {
    const { pool, create, clients, advance } = setup();
    pool.get();
    pool.release();
    advance(60_000);
    const got = [pool.get(), pool.get(), pool.get()];
    expect(create).toHaveBeenCalledTimes(2);
    expect(new Set(got).size).toBe(1);
    expect(clients[1]!.end).not.toHaveBeenCalled();
    got.forEach(() => pool.release());
  });

  it("con un pedido en curso no recicla, aunque pase la ventana", () => {
    const { pool, create, clients, advance } = setup();
    const a = pool.get(); // pedido largo, sin release
    advance(120_000);
    const b = pool.get();
    expect(b).toBe(a);
    expect(create).toHaveBeenCalledTimes(1);
    expect(clients[0]!.end).not.toHaveBeenCalled();
    pool.release();
    pool.release();
    // release renueva lastUsed: recién vencida la ventana desde ahí se recicla
    advance(29_000);
    expect(pool.get()).toBe(a);
  });
});
