"use server";

import { Position } from "@rwt/core";
import { setManualPosition, setWorkStatus, WorkNotFoundError, WorkPositionChangedError, WorkPositionMismatchError } from "@rwt/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { getAuthorizedDb } from "@/lib/dal";

// Server Actions are public POST endpoints: every argument is untrusted and validated here.
// `expected`: the position the stepper started from, so an outdated screen cannot move a work back.
const SetPositionInput = z.object({ workId: z.uuid(), position: Position, expected: Position.nullable().optional() });
const SetStatusInput = z.object({ workId: z.uuid(), status: z.enum(["reading", "completed", "dropped"]) });

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(action: () => Promise<void>): Promise<ActionResult> {
  try {
    await action();
  } catch (error) {
    if (error instanceof WorkNotFoundError) return { ok: false, error: "Titel nicht gefunden." };
    if (error instanceof WorkPositionMismatchError) return { ok: false, error: "Dieser Stand passt nicht zum Typ." };
    if (error instanceof WorkPositionChangedError) {
      refresh();
      return { ok: false, error: "Der Stand wurde inzwischen geändert – bitte noch einmal." };
    }
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function setPositionAction(input: unknown): Promise<ActionResult> {
  const db = await getAuthorizedDb();
  const parsed = SetPositionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const { workId, position, expected } = parsed.data;
  return run(() => setManualPosition(db, workId, position, new Date(), { expected }));
}

export async function setStatusAction(input: unknown): Promise<ActionResult> {
  const db = await getAuthorizedDb();
  const parsed = SetStatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  return run(() => setWorkStatus(db, parsed.data.workId, parsed.data.status));
}
