"use server";

import { DeviceName } from "@rwt/core";
import { approvePairing, PairingCodeInvalidError, revokeDevice } from "@rwt/server";
import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Server Actions are public POST endpoints: everything from the form is validated here.
const ApproveInput = z.object({
  code: z.string().trim().min(6).max(20),
  name: z.preprocess((value) => (value === "" ? undefined : value), DeviceName.optional()),
});
const RevokeInput = z.object({ deviceId: z.uuid() });

export async function approveDeviceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const input = ApproveInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Bitte den sechsstelligen Code vom Gerät eingeben." };
  try {
    await approvePairing(await getDb(), input.data.code, input.data.name);
  } catch (error) {
    if (error instanceof PairingCodeInvalidError) return { error: "Code unbekannt, abgelaufen oder schon benutzt." };
    throw error;
  }
  refresh();
  return { message: "Gerät gekoppelt. Es meldet sich in wenigen Sekunden." };
}

export async function revokeDeviceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const input = RevokeInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Ungültige Eingabe." };
  await revokeDevice(await getDb(), input.data.deviceId);
  refresh();
  return { message: "Widerrufen." };
}
