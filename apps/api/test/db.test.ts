import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.js";

let h: Harness;
beforeAll(async () => void (h = await createHarness()));
beforeEach(() => h.reset());
afterAll(() => h.close());

describe("esquema (F2)", () => {
  it("tiene RLS activado en todas las tablas del esquema público", async () => {
    const rows = await h.sql<
      { tablename: string; rowsecurity: boolean }[]
    >`select tablename, rowsecurity from pg_tables where schemaname = 'public'`;
    expect(rows.length).toBe(16);
    expect(rows.filter((r) => !r.rowsecurity)).toEqual([]);
  });

  it("no tiene políticas: la Data API no expone nada", async () => {
    expect(await h.sql`select 1 from pg_policies where schemaname = 'public'`).toHaveLength(0);
  });

  it.each(["anon", "authenticated"])("el rol %s no puede leer ninguna tabla", async (role) => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.shift(c, p, "2026-10-21", "08:00", "14:00");
    for (const table of ["shifts", "users", "medications", "wellbeing_records", "devices"]) {
      await expect(
        h.sql.begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          return tx.unsafe(`select * from ${table}`);
        }),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("rechaza escalas fuera de 0–4 en bienestar", async () => {
    const c = await h.caregiver();
    await expect(
      h.sql`insert into wellbeing_records (caregiver_id, mood, energy, stress) values (${c}, 5, 0, 0)`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      h.sql`insert into wellbeing_records (caregiver_id, mood, energy, stress) values (${c}, 0, -1, 0)`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("impide turnos superpuestos del mismo cuidador, incluso si cruzan la medianoche", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.shift(c, p, "2026-10-26", "22:00", "06:00");
    await expect(h.shift(c, p, "2026-10-27", "02:00", "04:00")).rejects.toMatchObject({
      code: "23P01",
    });
    await h.shift(c, p, "2026-10-27", "06:00", "08:00"); // pegado, no se superpone
  });

  it("mail_log: un cumpleaños por (mail, año), pero los mails de prueba se repiten", async () => {
    const ins = (kind: string, year: number) =>
      h.sql`insert into mail_log (to_email, subject, kind, year) values ('a@x.org', 's', ${kind}::mail_kind, ${year})`;
    await ins("birthday", 2026);
    await expect(ins("birthday", 2026)).rejects.toMatchObject({ code: "23505" });
    await ins("birthday", 2027);
    await ins("test", 2026);
    await ins("test", 2026);
  });

  it("borrar un usuario borra todo lo suyo", async () => {
    const c = await h.caregiver();
    const p = await h.patient();
    await h.shift(c, p, "2026-10-21", "08:00", "10:00");
    await h.sql`insert into wellbeing_records (caregiver_id, mood, energy, stress) values (${c}, 1, 1, 1)`;
    await h.sql`delete from users where id = ${c}`;
    expect(await h.sql`select 1 from shifts`).toHaveLength(0);
    expect(await h.sql`select 1 from wellbeing_records`).toHaveLength(0);
    expect(await h.sql`select 1 from devices where user_id = ${c}`).toHaveLength(0);
  });
});
