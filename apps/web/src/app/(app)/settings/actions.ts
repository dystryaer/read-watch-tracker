"use server";

import { DeviceName } from "@rwt/core";
import { approvePairing, createDeviceWithToken, PairingCodeInvalidError, revokeDevice } from "@rwt/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { getAuthorizedDb } from "@/lib/dal";

// Server Actions are public POST endpoints: everything from the form is validated here.
const ApproveInput = z.object({
  code: z.string().trim().min(6).max(20),
  name: z.preprocess((value) => (value === "" ? undefined : value), DeviceName.optional()),
});
const RevokeInput = z.object({ deviceId: z.uuid() });

export async function approveDeviceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = ApproveInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Bitte den sechsstelligen Code vom Gerät eingeben." };
  try {
    await approvePairing(db, input.data.code, input.data.name);
  } catch (error) {
    if (error instanceof PairingCodeInvalidError) return { error: "Code unbekannt, abgelaufen oder schon benutzt." };
    throw error;
  }
  // Leaves the confirmation (?code=…) so the used code is not looked up again.
  redirect("/settings?paired=1");
}

export async function revokeDeviceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = RevokeInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Ungültige Eingabe." };
  await revokeDevice(db, input.data.deviceId);
  refresh();
  return { message: "Widerrufen." };
}

export type PhoneTokenState = { token: string; name: string } | { error: string } | null;

const PhoneInput = z.object({ name: z.preprocess((value) => (value === "" || value === null ? "iPhone" : value), DeviceName) });

/**
 * A phone token for the iOS shortcut (SPEC §6.2): shortcuts cannot poll a pairing, so the token is
 * created here and returned once; the tracker keeps only its hash.
 */
export async function addPhoneAction(_previous: PhoneTokenState, formData: FormData): Promise<PhoneTokenState> {
  const db = await getAuthorizedDb();
  const input = PhoneInput.safeParse({ name: formData.get("name") });
  if (!input.success) return { error: "Bitte einen Namen mit höchstens 100 Zeichen angeben." };
  const { device, token } = await createDeviceWithToken(db, { kind: "phone", name: input.data.name });
  refresh();
  return { token, name: device.name };
}
