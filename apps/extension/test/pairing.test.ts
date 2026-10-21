import type { PairingPollResponse } from "@rwt/core";
import { describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../src/lib/api-client";
import { pollPairing, startPairing } from "../src/lib/pairing";
import { loadSettings } from "../src/lib/settings";
import { createStore } from "../src/lib/storage";
import { fakeStorage } from "./fakes";

const API = "https://tracker.example";
const NOW = Date.parse("2026-10-21T20:00:00.000Z");

type StartResult = ApiResult<{ code: string; pollSecret: string; expiresAt: string }>;
type PollResult = ApiResult<PairingPollResponse>;

function api(overrides: { start?: StartResult; poll?: PollResult } = {}) {
  return {
    startPairing: vi.fn(
      async (): Promise<StartResult> =>
        overrides.start ?? { ok: true, value: { code: "K7P3QX", pollSecret: "s".repeat(43), expiresAt: "2026-10-21T20:10:00.000Z" } },
    ),
    pollPairing: vi.fn(async (): Promise<PollResult> => overrides.poll ?? { ok: true, value: { status: "pending" } }),
  };
}

describe("startPairing", () => {
  it("asks the server for a code and remembers the pending pairing", async () => {
    const store = createStore(fakeStorage());

    const result = await startPairing({ store, api: api() }, API, "Brave Desktop");

    expect(result).toEqual({ ok: true, code: "K7P3QX", expiresAt: "2026-10-21T20:10:00.000Z" });
    expect((await loadSettings(store)).pairing).toMatchObject({ code: "K7P3QX", apiUrl: API });
  });

  it("normalizes the API address to its origin", async () => {
    const client = api();
    await startPairing({ store: createStore(fakeStorage()), api: client }, "https://tracker.example/settings?x=1", "Brave");
    expect(client.startPairing).toHaveBeenCalledWith(API, "Brave");
  });

  it("reports a server error", async () => {
    const result = await startPairing(
      { store: createStore(fakeStorage()), api: api({ start: { ok: false, kind: "retry", message: "offline" } }) },
      API,
      "Brave",
    );
    expect(result).toEqual({ ok: false, message: "offline" });
  });
});

describe("pollPairing", () => {
  it("stays pending while the user has not approved", async () => {
    const store = createStore(fakeStorage());
    const client = api();
    await startPairing({ store, api: client }, API, "Brave");

    expect(await pollPairing({ store, api: client }, NOW)).toBe("pending");
  });

  it("stores the token once approved and clears the pending pairing", async () => {
    const store = createStore(fakeStorage());
    const client = api({ poll: { ok: true, value: { status: "approved", deviceToken: "T".repeat(43) } } });
    await startPairing({ store, api: client }, API, "Brave");

    expect(await pollPairing({ store, api: client }, NOW)).toBe("paired");
    expect(await loadSettings(store)).toMatchObject({ apiUrl: API, deviceToken: "T".repeat(43), pairing: null });
  });

  it("gives up after the code expired", async () => {
    const store = createStore(fakeStorage());
    const client = api();
    await startPairing({ store, api: client }, API, "Brave");

    expect(await pollPairing({ store, api: client }, Date.parse("2026-10-21T20:11:00.000Z"))).toBe("expired");
    expect((await loadSettings(store)).pairing).toBeNull();
    expect(client.pollPairing).not.toHaveBeenCalled();
  });

  it("reports when nothing is being paired", async () => {
    expect(await pollPairing({ store: createStore(fakeStorage()), api: api() }, NOW)).toBe("idle");
  });
});

describe("loadSettings", () => {
  it("ignores a planted non-http API address", async () => {
    const store = createStore(fakeStorage({ settings: { apiUrl: "javascript:alert(1)", deviceToken: null, deviceName: "x", pairing: null } }), () => {});
    expect((await loadSettings(store)).apiUrl).toBeNull();
  });
});
