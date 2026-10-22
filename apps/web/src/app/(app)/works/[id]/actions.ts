"use server";

import { cleanText, MAX_TEXT_LENGTH, MAX_URL_LENGTH, MediaType, Position } from "@rwt/core";
import {
  CoverImageError,
  downloadImage,
  fillSiteCovers,
  MAX_COVER_BYTES,
  MergeIncompatibleError,
  mergeWorks,
  removeCover,
  resetCover,
  setCoverImage,
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
import { getAuthorizedDb } from "@/lib/dal";

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
const CoverInput = z.object({ workId: WorkId });
const CoverUrlInput = z.object({ workId: WorkId, url: z.string().trim().min(1).max(MAX_URL_LENGTH) });

const COVER_ERRORS: Record<string, string> = {
  invalid_url: "Bitte eine Bildadresse mit https:// angeben.",
  blocked: "Diese Adresse ist nicht erlaubt: Bilder kommen nur von öffentlichen Servern.",
  redirect: "Die Adresse leitet weiter. Bitte die Adresse des Bildes selbst nehmen (Rechtsklick → Bildadresse kopieren).",
  status: "Der Server hat das Bild nicht herausgegeben.",
  too_large: "Das Bild ist größer als 1 MB.",
  not_image: "Das ist kein unterstütztes Bild (JPEG, PNG, WebP, GIF oder AVIF).",
  network: "Der Server mit dem Bild war nicht erreichbar.",
};

const fields = (formData: FormData) => Object.fromEntries(formData.entries());
const INVALID: FormState = { error: "Bitte die Eingaben prüfen." };

async function guarded(action: () => Promise<void>, message = "Gespeichert."): Promise<FormState> {
  try {
    await action();
  } catch (error) {
    if (error instanceof WorkNotFoundError) return { error: "Titel nicht gefunden." };
    if (error instanceof WorkPositionMismatchError) return { error: "Dieser Stand passt nicht zum Typ." };
    if (error instanceof MergeIncompatibleError) return { error: "Diese Titel lassen sich nicht zusammenführen." };
    if (error instanceof CoverImageError) return { error: COVER_ERRORS[error.message] ?? COVER_ERRORS.not_image ?? "" };
    throw error;
  }
  refresh();
  return { message };
}

export async function updateMetaAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = MetaInput.safeParse(fields(formData));
  if (!input.success) return INVALID;
  return guarded(() => updateWorkMeta(db, input.data.workId, { title: input.data.title, type: input.data.type }));
}

export async function setPositionFormAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
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
  return guarded(() => setManualPosition(db, workId, position.data));
}

export async function setStatusFormAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = StatusInput.safeParse(fields(formData));
  if (!input.success) return INVALID;
  return guarded(() => setWorkStatus(db, input.data.workId, input.data.status));
}

export async function unlinkAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = UnlinkInput.safeParse(fields(formData));
  if (!input.success) return INVALID;
  return guarded(() => unlinkWork(db, input.data.workId, input.data.linkId), "Verknüpfung gelöst.");
}

export async function mergeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = MergeInput.safeParse(fields(formData));
  if (!input.success) return { error: "Bitte ein Ziel wählen und bestätigen." };
  const result = await guarded(() => mergeWorks(db, input.data.workId, input.data.intoId));
  if (result && "error" in result) return result;
  redirect(`/works/${input.data.intoId}`);
}

/** A picture from a file, the clipboard or drag and drop; the browser has made it small already. */
export async function uploadCoverAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = CoverInput.safeParse({ workId: formData.get("workId") });
  const image = formData.get("image");
  if (!input.success || !(image instanceof Blob) || image.size === 0) return { error: "Bitte ein Bild auswählen oder einfügen." };
  if (image.size > MAX_COVER_BYTES) return { error: COVER_ERRORS.too_large ?? "" };
  const bytes = new Uint8Array(await image.arrayBuffer());
  return guarded(() => setCoverImage(db, input.data.workId, bytes), "Bild gespeichert.");
}

/** A picture from its address (e.g. "Bildadresse kopieren" on the reading site), downloaded once. */
export async function coverFromUrlAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = CoverUrlInput.safeParse(fields(formData));
  if (!input.success) return { error: COVER_ERRORS.invalid_url ?? "" };
  const result = await downloadImage(input.data.url);
  if (!result.ok) return { error: COVER_ERRORS[result.reason] ?? "" };
  return guarded(() => setCoverImage(db, input.data.workId, result.bytes, { sourceUrl: input.data.url }), "Bild gespeichert.");
}

export async function removeCoverAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = CoverInput.safeParse(fields(formData));
  if (!input.success) return INVALID;
  return guarded(() => removeCover(db, input.data.workId), "Bild entfernt.");
}

/** Back to the picture the reading site names, e.g. after removing one added by hand. */
export async function siteCoverAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = CoverInput.safeParse(fields(formData));
  if (!input.success) return INVALID;
  await resetCover(db, input.data.workId);
  const stored = await fillSiteCovers(db, downloadImage, { workId: input.data.workId });
  refresh();
  return stored > 0 ? { message: "Bild der Seite übernommen." } : { error: "Die Seite liefert gerade kein brauchbares Bild." };
}
