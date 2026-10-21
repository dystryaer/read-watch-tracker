import { createHash } from "node:crypto";
import { type DbHandle, devices, pairingCodes } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  approvePairing,
  authenticateDevice,
  createDeviceWithToken,
  listDevices,
  PairingCodeInvalidError,
  pollPairing,
  revokeDevice,
  startPairing,
} from "../src/devices";

let handle: DbHandle;
const NOW = new Date("2026-10-21T20:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle?.close();
});
beforeEach(async () => {
  await resetDb(handle.db);
});

describe("startPairing", () => {
  it("returns a readable 6-character code that expires after 10 minutes", async () => {
    const pairing = await startPairing(handle.db, { kind: "extension", name: "Brave Desktop" }, NOW);

    expect(pairing.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(pairing.expiresAt).toEqual(minutes(10));
    expect(pairing.pollSecret.length).toBeGreaterThanOrEqual(43);
  });

  it("stores only a hash of the poll secret", async () => {
    const pairing = await startPairing(handle.db, { kind: "shield", name: "Shield" }, NOW);

    const [row] = await handle.db.select().from(pairingCodes);
    expect(row?.pollSecretHash).toBe(sha256(pairing.pollSecret));
    expect(JSON.stringify(row)).not.toContain(pairing.pollSecret);
  });

  it("removes codes that expired more than a day ago", async () => {
    await startPairing(handle.db, { kind: "shield", name: "Old" }, minutes(-3 * 24 * 60));
    await startPairing(handle.db, { kind: "shield", name: "New" }, NOW);

    const rows = await handle.db.select().from(pairingCodes);
    expect(rows.map((r) => r.deviceName)).toEqual(["New"]);
  });
});

describe("pairing flow", () => {
  it("is pending until approved, then delivers the token exactly once", async () => {
    const pairing = await startPairing(handle.db, { kind: "extension", name: "Brave Desktop" }, NOW);

    expect(await pollPairing(handle.db, pairing.pollSecret, minutes(1))).toEqual({ status: "pending" });

    const { deviceId } = await approvePairing(handle.db, pairing.code, undefined, minutes(2));
    const approved = await pollPairing(handle.db, pairing.pollSecret, minutes(3));
    const again = await pollPairing(handle.db, pairing.pollSecret, minutes(4));

    expect(approved.status).toBe("approved");
    expect(again).toEqual({ status: "expired" });
    if (approved.status !== "approved") return;
    const [device] = await handle.db.select().from(devices).where(eq(devices.id, deviceId));
    expect(device).toMatchObject({ name: "Brave Desktop", kind: "extension", tokenHash: sha256(approved.deviceToken) });
  });

  it("lets the user rename the device when approving", async () => {
    const pairing = await startPairing(handle.db, { kind: "shield", name: "Shield" }, NOW);

    const { deviceId } = await approvePairing(handle.db, pairing.code, "Shield Wohnzimmer", minutes(1));

    const [device] = await handle.db.select().from(devices).where(eq(devices.id, deviceId));
    expect(device?.name).toBe("Shield Wohnzimmer");
  });

  it("accepts the code in lower case and with separators", async () => {
    const pairing = await startPairing(handle.db, { kind: "shield", name: "Shield" }, NOW);
    const typed = `${pairing.code.slice(0, 3)}-${pairing.code.slice(3)}`.toLowerCase();

    await expect(approvePairing(handle.db, ` ${typed} `, undefined, minutes(1))).resolves.toBeDefined();
  });

  it("rejects an unknown code", async () => {
    await expect(approvePairing(handle.db, "ZZZZZZ", undefined, NOW)).rejects.toThrow(PairingCodeInvalidError);
  });

  it("rejects an expired code", async () => {
    const pairing = await startPairing(handle.db, { kind: "shield", name: "Shield" }, NOW);
    await expect(approvePairing(handle.db, pairing.code, undefined, minutes(11))).rejects.toThrow(PairingCodeInvalidError);
  });

  it("rejects approving the same code twice", async () => {
    const pairing = await startPairing(handle.db, { kind: "shield", name: "Shield" }, NOW);
    await approvePairing(handle.db, pairing.code, undefined, minutes(1));
    await expect(approvePairing(handle.db, pairing.code, undefined, minutes(2))).rejects.toThrow(PairingCodeInvalidError);
  });

  it("reports an unapproved code as expired after 10 minutes", async () => {
    const pairing = await startPairing(handle.db, { kind: "shield", name: "Shield" }, NOW);
    expect(await pollPairing(handle.db, pairing.pollSecret, minutes(11))).toEqual({ status: "expired" });
  });

  it("reports an unknown poll secret as expired", async () => {
    expect(await pollPairing(handle.db, "unknown-secret", NOW)).toEqual({ status: "expired" });
  });
});

describe("authenticateDevice", () => {
  it("returns the device for a valid token and records when it was seen", async () => {
    const { device, token } = await createDeviceWithToken(handle.db, { kind: "phone", name: "iPhone" }, NOW);

    const authenticated = await authenticateDevice(handle.db, token, minutes(5));

    expect(authenticated?.id).toBe(device.id);
    const [stored] = await handle.db.select().from(devices).where(eq(devices.id, device.id));
    expect(stored?.lastSeenAt).toEqual(minutes(5));
  });

  it("returns null for a revoked device", async () => {
    const { device, token } = await createDeviceWithToken(handle.db, { kind: "phone", name: "iPhone" }, NOW);
    await revokeDevice(handle.db, device.id, minutes(1));

    expect(await authenticateDevice(handle.db, token, minutes(2))).toBeNull();
  });

  it.each([[""], ["short"], ["x".repeat(500)], ["not base64url!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"]])(
    "returns null for the malformed token %j",
    async (token) => {
      expect(await authenticateDevice(handle.db, token, NOW)).toBeNull();
    },
  );

  it("returns null for an unknown well-formed token", async () => {
    expect(await authenticateDevice(handle.db, "A".repeat(43), NOW)).toBeNull();
  });

  it("does not accept the token hash itself as a token", async () => {
    const { device } = await createDeviceWithToken(handle.db, { kind: "phone", name: "iPhone" }, NOW);
    const [stored] = await handle.db.select().from(devices).where(eq(devices.id, device.id));

    expect(await authenticateDevice(handle.db, stored?.tokenHash ?? "", NOW)).toBeNull();
  });
});

describe("listDevices", () => {
  it("lists devices newest first without token hashes", async () => {
    await createDeviceWithToken(handle.db, { kind: "extension", name: "Brave" }, NOW);
    await createDeviceWithToken(handle.db, { kind: "shield", name: "Shield" }, minutes(1));

    const list = await listDevices(handle.db);

    expect(list.map((d) => d.name)).toEqual(["Shield", "Brave"]);
    expect(list[0]).not.toHaveProperty("tokenHash");
  });
});
