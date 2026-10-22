import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReminderSettings } from "../api/types";
import { createWebReminderScheduler, dueReminders } from "./scheduler";

const settings: ReminderSettings = {
  water: { on: true, freq: 60, from: "08:00", to: "20:00" },
  stretch: { on: true, freq: 120, from: "09:00", to: "19:00" },
  relax: { on: true, times: ["11:00", "16:00"] },
};
const at = (h: number, m: number) => new Date(2026, 9, 22, h, m);

describe("dueReminders", () => {
  it("agua cada hora en la ventana, estiramientos cada 2 horas desde las 9", () => {
    expect(dueReminders(settings, at(8, 0), new Set())).toEqual(["water"]);
    expect(dueReminders(settings, at(9, 0), new Set())).toEqual(["water", "stretch"]);
    expect(dueReminders(settings, at(10, 0), new Set())).toEqual(["water"]);
    expect(dueReminders(settings, at(11, 0), new Set())).toEqual(["water", "stretch", "relax"]);
  });
  it("fuera de la ventana o a minutos que no tocan, nada", () => {
    expect(dueReminders(settings, at(7, 0), new Set())).toEqual([]);
    expect(dueReminders(settings, at(20, 30), new Set())).toEqual([]);
    expect(dueReminders(settings, at(10, 30), new Set())).toEqual([]);
  });
  it("no repite el mismo aviso en el mismo minuto", () => {
    const fired = new Set<string>();
    expect(dueReminders(settings, at(8, 0), fired)).toEqual(["water"]);
    expect(dueReminders(settings, at(8, 0), fired)).toEqual([]);
  });
  it("apagado no avisa", () => {
    const off: ReminderSettings = {
      water: { ...settings.water, on: false },
      stretch: { ...settings.stretch, on: false },
      relax: { on: false, times: ["11:00"] },
    };
    expect(dueReminders(off, at(11, 0), new Set())).toEqual([]);
  });
});

describe("createWebReminderScheduler", () => {
  afterEach(() => vi.useRealTimers());

  it("revisa cada tanto y avisa; cancel() lo detiene", () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    let now = at(8, 0);
    const scheduler = createWebReminderScheduler(notify, { now: () => now, intervalMs: 1000 });
    scheduler.schedule(settings);
    vi.advanceTimersByTime(1000);
    expect(notify).toHaveBeenCalledWith("water");
    scheduler.cancel();
    now = at(9, 0);
    vi.advanceTimersByTime(5000);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("schedule reemplaza la programación anterior", () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    const scheduler = createWebReminderScheduler(notify, { now: () => at(8, 0), intervalMs: 1000 });
    scheduler.schedule(settings);
    scheduler.schedule({ ...settings, water: { ...settings.water, on: false } });
    vi.advanceTimersByTime(3000);
    expect(notify).not.toHaveBeenCalled();
  });
});
