"use server";

import { cleanText, MAX_TEXT_LENGTH, MediaType, Position } from "@rwt/core";
import {
  MergeIncompatibleError,
  mergeWorks,
  setManualPosition,
  setWorkStatus,
  unlinkWork,
  updateWorkMeta,
  WorkNotFoundError,
  WorkPositionMismatchError,
} from "@rwt/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Server Actions are public POST endpoints: everything from the form is validated here.
// Empty fields count as missing; z.coerce.number("") would otherwise silently become 0.
const optionalNumber = z.preprocess((value) => (value === "" || value === null ? undefined : value), z.coerce.number().optional());
const WorkId = z.uuid();

const MetaInput = z.object({ workId: WorkId, title: cleanText(MAX_TEXT_LENGTH), type: MediaType });
const PositionInput = z.object({
  workId: WorkId,
  unit: z.enum(["chapter", "episode", "percent"]),
  chapter: optionalNumber,
  season: optionalNumber,
  episode: optionalNumber,
  percent: optionalNumber,
});
const StatusInput = z.object({ workId: WorkId, status: z.enum(["reading", "completed", "dropped"]) });
const UnlinkInput = z.object({ workId: WorkId, linkId: z.uuid() });
const MergeInput = z.object({ workId: WorkId, intoId: WorkId, confirm: z.literal("on") });

const fields = (formData: FormData) => Object.fromEntries(formData.entries());
const INVALID: FormState = { error: "Bitte die Eingaben prüfen." };

async function guarded(action: () => Promise<void>, message = "Gespeichert."): Promise<FormState> {
  try {
    await action();
  } catch (error) {
    if (error instanceof WorkNotFoundError) return { error: "Titel nicht gefunden." };
    if (error instanceof WorkPositionMismatchError) return { error: "Dieser Stand passt nicht zum Typ." };
    if (error instanceof MergeIncompatibleError) return { error: "Diese Titel lassen sich nicht zusammenführen." };
    throw error;
  }
  refresh();
  return { message };
}

export async function updateMetaAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const input = MetaInput.safeParse(fields(formData));
  if (!input.success) return INVALID;
  const db = await getDb();
  return guarded(() => updateWorkMeta(db, input.data.workId, { title: input.data.title, type: input.data.type }));
}

export async function setPositionFormAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const input = PositionInput.safeParse(fields(formData));
  if (!input.success) return INVALID;
  const { workId, unit, chapter, season, episode, percent } = input.data;
  const position = Position.safeParse(
    unit === "chapter"
      ? { unit, chapter }
      : unit === "episode"
        ? { unit, season: season ?? null, episode }
        : { unit, percent },
  );
  if (!position.success) return { error: "Bitte einen gültigen Stand eingeben." };
  const db = await getDb();
  return guarded(() => setManualPosition(db, workId, position.data));
}

export async function setStatusFormAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const input = StatusInput.safeParse(fields(formData));
  if (!input.success) return INVALID;
  const db = await getDb();
  return guarded(() => setWorkStatus(db, input.data.workId, input.data.status));
}

export async function unlinkAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const input = UnlinkInput.safeParse(fields(formData));
  if (!input.success) return INVALID;
  const db = await getDb();
  return guarded(() => unlinkWork(db, input.data.workId, input.data.linkId), "Verknüpfung gelöst.");
}

export async function mergeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const input = MergeInput.safeParse(fields(formData));
  if (!input.success) return { error: "Bitte ein Ziel wählen und bestätigen." };
  const db = await getDb();
  const result = await guarded(() => mergeWorks(db, input.data.workId, input.data.intoId));
  if (result && "error" in result) return result;
  redirect(`/works/${input.data.intoId}`);
}
