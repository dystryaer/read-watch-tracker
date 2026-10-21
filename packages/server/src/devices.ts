import { createHash, randomBytes, randomInt } from "node:crypto";
import { type Db, devices, pairingCodes } from "@rwt/db";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";

export type DeviceKind = (typeof devices.$inferSelect)["kind"];
export type Device = typeof devices.$inferSelect;
export type DeviceSummary = Omit<Device, "tokenHash">;

const PAIRING_TTL_MS = 10 * 60 * 1000;
const PAIRING_CLEANUP_AFTER_MS = 24 * 60 * 60 * 1000;
const LAST_SEEN_RESOLUTION_MS = 60 * 1000;
// No 0/O, 1/I/L: codes are typed from a TV screen.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
// 32 random bytes in base64url are exactly 43 characters.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export class PairingCodeInvalidError extends Error {
  constructor() {
    super("Pairing code is unknown, expired or already used");
    this.name = "PairingCodeInvalidError";
  }
}

// Allowlist, so a column added later is never handed out by accident.
function toSummary(device: Device): DeviceSummary {
  const { id, name, kind, createdAt, lastSeenAt, revokedAt } = device;
  return { id, name, kind, createdAt, lastSeenAt, revokedAt };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

function randomCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** Step 1 of the device flow (SPEC §6.2): the device shows `code` and polls with `pollSecret`. */
export async function startPairing(
  db: Db,
  device: { kind: DeviceKind; name: string },
  now = new Date(),
): Promise<{ code: string; pollSecret: string; expiresAt: Date }> {
  await db.delete(pairingCodes).where(lt(pairingCodes.expiresAt, new Date(now.getTime() - PAIRING_CLEANUP_AFTER_MS)));

  const pollSecret = randomToken();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const [row] = await db
      .insert(pairingCodes)
      .values({
        code,
        pollSecretHash: sha256(pollSecret),
        deviceKind: device.kind,
        deviceName: device.name,
        createdAt: now,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ code: pairingCodes.code });
    if (row) return { code: row.code, pollSecret, expiresAt };
  }
  throw new Error("Could not allocate a pairing code");
}

/** Step 2: the logged-in user enters the code in the web app. */
export async function approvePairing(
  db: Db,
  typedCode: string,
  deviceName: string | undefined,
  now = new Date(),
): Promise<{ deviceId: string }> {
  const code = typedCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return db.transaction(async (tx) => {
    const [pairing] = await tx
      .select()
      .from(pairingCodes)
      .where(and(eq(pairingCodes.code, code), gt(pairingCodes.expiresAt, now), isNull(pairingCodes.approvedDeviceId)));
    if (!pairing) throw new PairingCodeInvalidError();

    const [device] = await tx
      .insert(devices)
      .values({ name: deviceName ?? pairing.deviceName, kind: pairing.deviceKind, createdAt: now })
      .returning({ id: devices.id });
    if (!device) throw new Error("Device could not be created");
    await tx.update(pairingCodes).set({ approvedDeviceId: device.id }).where(eq(pairingCodes.code, code));
    return { deviceId: device.id };
  });
}

export type PollResult = { status: "pending" } | { status: "expired" } | { status: "approved"; deviceToken: string };

/**
 * Step 3: the device polls. The token is created on the first poll after approval and only its
 * hash is stored, so it is delivered exactly once and never kept in plain text.
 */
export async function pollPairing(db: Db, pollSecret: string, now = new Date()): Promise<PollResult> {
  return db.transaction(async (tx) => {
    const [pairing] = await tx.select().from(pairingCodes).where(eq(pairingCodes.pollSecretHash, sha256(pollSecret)));
    if (!pairing || pairing.tokenIssuedAt !== null) return { status: "expired" };
    if (pairing.approvedDeviceId === null) {
      return pairing.expiresAt.getTime() > now.getTime() ? { status: "pending" } : { status: "expired" };
    }

    const deviceToken = randomToken();
    await tx.update(devices).set({ tokenHash: sha256(deviceToken) }).where(eq(devices.id, pairing.approvedDeviceId));
    await tx.update(pairingCodes).set({ tokenIssuedAt: now }).where(eq(pairingCodes.code, pairing.code));
    return { status: "approved", deviceToken };
  });
}

/** For clients that cannot poll, such as the iOS shortcut (SPEC §6.2): token shown once in the web app. */
export async function createDeviceWithToken(
  db: Db,
  device: { kind: DeviceKind; name: string },
  now = new Date(),
): Promise<{ device: DeviceSummary; token: string }> {
  const token = randomToken();
  const [created] = await db
    .insert(devices)
    .values({ ...device, tokenHash: sha256(token), createdAt: now })
    .returning();
  if (!created) throw new Error("Device could not be created");
  return { device: toSummary(created), token };
}

/** Bearer-token check for the device API; revoked or malformed tokens yield null. */
export async function authenticateDevice(db: Db, token: string, now = new Date()): Promise<DeviceSummary | null> {
  if (!TOKEN_FORMAT.test(token)) return null;
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.tokenHash, sha256(token)), isNull(devices.revokedAt)));
  if (!device) return null;

  if (device.lastSeenAt === null || now.getTime() - device.lastSeenAt.getTime() >= LAST_SEEN_RESOLUTION_MS) {
    await db.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, device.id));
    device.lastSeenAt = now;
  }
  return toSummary(device);
}

export async function revokeDevice(db: Db, deviceId: string, now = new Date()): Promise<void> {
  await db.update(devices).set({ revokedAt: now }).where(eq(devices.id, deviceId));
}

export async function listDevices(db: Db): Promise<DeviceSummary[]> {
  return db
    .select({
      id: devices.id,
      name: devices.name,
      kind: devices.kind,
      createdAt: devices.createdAt,
      lastSeenAt: devices.lastSeenAt,
      revokedAt: devices.revokedAt,
    })
    .from(devices)
    .orderBy(desc(devices.createdAt));
}
