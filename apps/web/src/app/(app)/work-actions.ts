"use server";

import { Position } from "@rwt/core";
import { setManualPosition, setWorkStatus, WorkNotFoundError, WorkPositionMismatchError } from "@rwt/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Server Actions are public POST endpoints: every argument is untrusted and validated here.
const SetPositionInput = z.object({ workId: z.uuid(), position: Position });
const SetStatusInput = z.object({ workId: z.uuid(), status: z.enum(["reading", "completed", "dropped"]) });

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(action: () => Promise<void>): Promise<ActionResult> {
  try {
    await action();
  } catch (error) {
    if (error instanceof WorkNotFoundError) return { ok: false, error: "Titel nicht gefunden." };
    if (error instanceof WorkPositionMismatchError) return { ok: false, error: "Dieser Stand passt nicht zum Typ." };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function setPositionAction(input: unknown): Promise<ActionResult> {
  await requireSession();
  const parsed = SetPositionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const db = await getDb();
  return run(() => setManualPosition(db, parsed.data.workId, parsed.data.position));
}

export async function setStatusAction(input: unknown): Promise<ActionResult> {
  await requireSession();
  const parsed = SetStatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const db = await getDb();
  return run(() => setWorkStatus(db, parsed.data.workId, parsed.data.status));
}
