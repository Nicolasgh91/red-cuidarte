import { describe, expect, it } from "vitest";
import {
  absEnd,
  absStart,
  addDays,
  ago,
  birthToIso,
  dayNum,
  durMin,
  fmtHours,
  gcalShift,
  hrsLabel,
  iso,
  isoToBirth,
  monday,
  nextBirthday,
  parseBirth,
  parseTimes,
  relDay,
  toMin,
  weekLabel,
} from "./dates";

describe("fechas y horarios", () => {
  it("monday devuelve el lunes de la semana (la semana empieza el lunes)", () => {
    expect(iso(monday(new Date(2026, 9, 22)))).toBe("2026-10-19"); // jueves
    expect(iso(monday(new Date(2026, 9, 25)))).toBe("2026-10-19"); // domingo
    expect(iso(monday(new Date(2026, 9, 19)))).toBe("2026-10-19"); // lunes
  });

  it("weekLabel respeta si la semana cruza de mes", () => {
    expect(weekLabel(new Date(2026, 9, 19))).toBe("Semana del 19 al 25 de octubre");
    expect(weekLabel(new Date(2026, 9, 26))).toBe("Semana del 26 de octubre al 1 de noviembre");
  });

  it("toMin y durMin: los turnos que cruzan la medianoche duran lo correcto", () => {
    expect(toMin("08:30")).toBe(510);
    expect(toMin("08:30:00")).toBe(510);
    expect(toMin("")).toBeNull();
    expect(durMin("08:00", "14:00")).toBe(360);
    expect(durMin("22:00", "06:00")).toBe(480);
    expect(durMin("08:00", "08:00")).toBe(1440);
    expect(fmtHours(360)).toBe("6 h");
    expect(fmtHours(390)).toBe("6 h 30 min");
  });

  it("hrsLabel marca (+1) cuando el turno termina al día siguiente", () => {
    expect(hrsLabel({ date: "2026-10-19", start: "08:00", end: "14:00" })).toBe("08:00–14:00");
    expect(hrsLabel({ date: "2026-10-19", start: "22:00", end: "06:00" })).toBe("22:00–06:00 (+1)");
  });

  it("absStart/absEnd ordenan turnos en una misma escala", () => {
    const a = { date: "2026-10-19", start: "22:00", end: "06:00" };
    expect(absEnd(a) - absStart(a)).toBe(480);
    expect(dayNum("2026-10-20") - dayNum("2026-10-19")).toBe(1);
  });

  it("relDay: Hoy / Mañana / Ayer / fecha larga", () => {
    const now = new Date(2026, 9, 22, 10);
    expect(relDay("2026-10-22", now)).toBe("Hoy");
    expect(relDay("2026-10-23", now)).toBe("Mañana");
    expect(relDay("2026-10-21", now)).toBe("Ayer");
    expect(relDay("2026-10-26", now)).toMatch(/^Lunes/);
  });

  it("ago", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(ago(now - 30_000, now)).toBe("hace 1 min");
    expect(ago(now - 5 * 60_000, now)).toBe("hace 5 min");
    expect(ago(now - 3 * 3_600_000, now)).toBe("hace 3 h");
    expect(ago("2026-10-20T12:00:00Z", now)).toBe("hace 2 d");
  });
});

describe("fecha de nacimiento dd/mm/aaaa", () => {
  const now = new Date(2026, 9, 22);
  it("acepta fechas reales y las pasa a ISO y de vuelta", () => {
    expect(parseBirth("14/05/1980", now)).toEqual(new Date(1980, 4, 14));
    expect(birthToIso("14/05/1980", now)).toBe("1980-05-14");
    expect(isoToBirth("1980-05-14")).toBe("14/05/1980");
    expect(isoToBirth(null)).toBe("");
  });
  it("rechaza formato, fechas imposibles, anteriores a 1900 y futuras", () => {
    expect(parseBirth("1980-05-14", now)).toBeNull();
    expect(parseBirth("31/02/1980", now)).toBeNull();
    expect(parseBirth("14/5/1980", now)).toBeNull();
    expect(parseBirth("01/01/1900", now)).toBeNull();
    expect(parseBirth("01/01/2030", now)).toBeNull();
    expect(birthToIso("", now)).toBeNull();
  });
});

describe("nextBirthday", () => {
  const now = new Date(2026, 9, 22);
  it("cumpleaños que todavía no pasó este año", () => {
    const n = nextBirthday("1990-11-03", now)!;
    expect(n.days).toBe(12);
    expect(n.age).toBe(36);
    expect(iso(n.date)).toBe("2026-11-03");
  });
  it("si ya pasó, es el del año que viene", () => {
    const n = nextBirthday("1980-05-14", now)!;
    expect(iso(n.date)).toBe("2027-05-14");
    expect(n.age).toBe(47);
  });
  it("hoy es 0 días", () => {
    expect(nextBirthday("1975-10-22", now)!.days).toBe(0);
  });
  it("fecha inválida → null", () => {
    expect(nextBirthday("nada", now)).toBeNull();
  });
});

describe("parseTimes (horarios de medicación)", () => {
  it("normaliza, ordena y quita repetidos", () => {
    expect(parseTimes("20:00, 8 y 9:30, 08:00")).toEqual({
      times: ["08:00", "09:30", "20:00"],
      bad: null,
    });
  });
  it("devuelve el primer horario inválido", () => {
    expect(parseTimes("08:00, 25:00").bad).toBe("25:00");
    expect(parseTimes("08:75").bad).toBe("08:75");
    expect(parseTimes("mañana").bad).toBe("mañana");
  });
  it("vacío → sin horarios", () => {
    expect(parseTimes("")).toEqual({ times: [], bad: null });
  });
});

describe("Google Calendar", () => {
  it("el turno nocturno termina al día siguiente", () => {
    const url = gcalShift({ date: "2026-10-19", start: "22:00", end: "06:00" }, "Elena Pérez");
    expect(url).toContain("dates=20261019T220000/20261020T060000");
    expect(url).toContain(encodeURIComponent("Turno · Elena Pérez"));
  });
  it("addDays no muta la fecha original", () => {
    const d = new Date(2026, 9, 22);
    addDays(d, 5);
    expect(iso(d)).toBe("2026-10-22");
  });
});
