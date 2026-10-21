import { describe, expect, it, vi } from "vitest";
import { ensureAlarm } from "../src/lib/alarms";

function fakeAlarms(existing: Record<string, { periodInMinutes?: number }> = {}) {
  return {
    get: vi.fn(async (name: string) => existing[name]),
    create: vi.fn<(name: string, info: { delayInMinutes?: number; periodInMinutes: number }) => Promise<void>>(async () => {}),
  };
}

describe("ensureAlarm", () => {
  it("creates a missing alarm", async () => {
    const alarms = fakeAlarms();
    await ensureAlarm(alarms, "new-chapters", { delayInMinutes: 5, periodInMinutes: 60 });
    expect(alarms.create).toHaveBeenCalledWith("new-chapters", { delayInMinutes: 5, periodInMinutes: 60 });
  });

  it("keeps a running alarm, so a service worker start does not push it back", async () => {
    const alarms = fakeAlarms({ "new-chapters": { periodInMinutes: 60 } });
    await ensureAlarm(alarms, "new-chapters", { delayInMinutes: 5, periodInMinutes: 60 });
    expect(alarms.create).not.toHaveBeenCalled();
  });

  it("replaces an alarm whose period changed, e.g. after an update", async () => {
    const alarms = fakeAlarms({ config: { periodInMinutes: 30 } });
    await ensureAlarm(alarms, "config", { periodInMinutes: 15 });
    expect(alarms.create).toHaveBeenCalledWith("config", { periodInMinutes: 15 });
  });
});
