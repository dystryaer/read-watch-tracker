import { describe, expect, it } from "vitest";
import { apiOrigin, loadSettings } from "../src/lib/settings";
import { createStore } from "../src/lib/storage";
import { fakeStorage } from "./fakes";

describe("apiOrigin", () => {
  it("keeps only the origin of an https address", () => {
    expect(apiOrigin(" https://Tracker.example/settings?x=1 ")).toBe("https://tracker.example");
  });

  it.each([["http://localhost:3000"], ["http://127.0.0.1:3210"], ["http://[::1]:3000"]])(
    "allows plain http for the local machine: %s",
    (raw) => {
      expect(apiOrigin(raw)).toBe(raw);
    },
  );

  it.each([["http://tracker.example"], ["http://192.168.1.10:3000"], ["http://localhost.evil.example"], ["ftp://tracker.example"], ["tracker.example"], [""]])(
    "refuses %j, since the device token would travel unencrypted",
    (raw) => {
      expect(apiOrigin(raw)).toBeNull();
    },
  );
});

describe("loadSettings", () => {
  it("drops a stored plain-http tracker address, e.g. from tampered storage", async () => {
    const storage = fakeStorage();
    await storage.set({ settings: { apiUrl: "http://tracker.example", deviceToken: "A".repeat(43), deviceName: "Brave", pairing: null } });

    const settings = await loadSettings(createStore(storage));

    expect(settings.apiUrl).toBeNull();
    expect(settings.deviceToken).toBe("A".repeat(43));
  });
});
