import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReminderSettings } from "../api/types";

const plugin = vi.hoisted(() => ({
  getPending: vi.fn(),
  cancel: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: plugin }));

import { createNativeReminderScheduler, dailyReminders, reminderId } from "./native";

const settings = (over: Partial<ReminderSettings> = {}): ReminderSettings => ({
  water: { on: true, freq: 60, from: "08:00", to: "10:00" },
  stretch: { on: false, freq: 120, from: "09:00", to: "19:00" },
  relax: { on: true, times: ["16:00", "11:00", "11:00"] },
  ...over,
});

describe("dailyReminders", () => {
  it("agua cada hora de 08:00 a 10:00 inclusive y relajación ordenada y sin repetidos", () => {
    expect(dailyReminders(settings()).map((r) => `${r.type} ${r.hour}:${r.minute}`)).toEqual([
      "water 8:0",
      "water 9:0",
      "water 10:0",
      "relax 11:0",
      "relax 16:0",
    ]);
  });
  it("respeta la frecuencia y el apagado de cada aviso", () => {
    const s = settings({
      water: { on: false, freq: 60, from: "08:00", to: "10:00" },
      stretch: { on: true, freq: 30, from: "09:00", to: "10:00" },
      relax: { on: false, times: ["11:00"] },
    });
    expect(dailyReminders(s).map((r) => `${r.type} ${r.hour}:${r.minute}`)).toEqual([
      "stretch 9:0",
      "stretch 9:30",
      "stretch 10:0",
    ]);
  });
  it("el máximo posible entra en el rango de ids de cada tipo", () => {
    const s = settings({ water: { on: true, freq: 30, from: "00:00", to: "23:59" } });
    expect(dailyReminders(s).filter((r) => r.type === "water")).toHaveLength(48);
  });
});

describe("createNativeReminderScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plugin.getPending.mockResolvedValue({ notifications: [] });
    plugin.checkPermissions.mockResolvedValue({ display: "granted" });
    plugin.requestPermissions.mockResolvedValue({ display: "granted" });
  });

  it("programa notificaciones diarias, sin alarma exacta, con ids estables por tipo", async () => {
    await createNativeReminderScheduler().schedule(settings());
    const { notifications } = plugin.schedule.mock.calls[0]![0];
    expect(notifications).toHaveLength(5);
    expect(notifications[0]).toMatchObject({
      id: reminderId("water", 0),
      body: "Es hora de tomar agua. Un minuto para hidratarte.",
      schedule: { on: { hour: 8, minute: 0 }, allowWhileIdle: true },
      isExactNotification: false,
    });
    expect(notifications.map((n: { id: number }) => n.id)).toEqual([1000, 1001, 1002, 3000, 3001]);
  });

  it("reprograma: cancela primero lo anterior (solo lo propio)", async () => {
    plugin.getPending.mockResolvedValue({
      notifications: [{ id: 1000 }, { id: 1001 }, { id: 42 }],
    });
    await createNativeReminderScheduler().schedule(settings());
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1000 }, { id: 1001 }] });
    expect(plugin.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      plugin.schedule.mock.invocationCallOrder[0]!,
    );
  });

  it("pide el permiso de notificaciones y no programa si lo niegan", async () => {
    plugin.checkPermissions.mockResolvedValue({ display: "prompt" });
    plugin.requestPermissions.mockResolvedValue({ display: "denied" });
    await createNativeReminderScheduler().schedule(settings());
    expect(plugin.requestPermissions).toHaveBeenCalled();
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it("si todo está apagado, solo limpia", async () => {
    const off = settings({
      water: { on: false, freq: 60, from: "08:00", to: "10:00" },
      relax: { on: false, times: [] },
    });
    await createNativeReminderScheduler().schedule(off);
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it("un cancel() tardío no borra lo que acaba de programarse (operaciones en orden)", async () => {
    const s = createNativeReminderScheduler();
    const order: string[] = [];
    plugin.getPending.mockImplementation(async () => {
      order.push("getPending");
      return { notifications: [] };
    });
    plugin.schedule.mockImplementation(async () => void order.push("schedule"));
    void s.cancel();
    await s.schedule(settings());
    expect(order).toEqual(["getPending", "getPending", "schedule"]);
  });

  it("un error del plugin no rompe la app", async () => {
    plugin.getPending.mockRejectedValue(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(createNativeReminderScheduler().schedule(settings())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
