"use server";

import { cleanText, MAX_TEXT_LENGTH, MediaType } from "@rwt/core";
import { confirmMatches, PendingMatchNotFoundError, resolvePendingMatch } from "@rwt/server";
import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { getAuthorizedDb } from "@/lib/dal";

// Server Actions are public POST endpoints: everything from the form is validated here.
const ResolveInput = z.object({
  pendingId: z.uuid(),
  choice: z.union([z.literal("new"), z.uuid()]),
  type: MediaType,
  title: z.preprocess((value) => (value === "" ? undefined : value), cleanText(MAX_TEXT_LENGTH).optional()),
});
const IgnoreInput = z.object({ pendingId: z.uuid() });
const ConfirmAllInput = z.array(z.uuid()).min(1).max(500);

async function guarded(action: () => Promise<unknown>, message: string): Promise<FormState> {
  try {
    await action();
  } catch (error) {
    if (error instanceof PendingMatchNotFoundError) return { error: "Diese Zuordnung ist schon erledigt." };
    throw error;
  }
  refresh();
  return { message };
}

export async function resolveMatchAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = ResolveInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Bitte einen Titel wählen oder „Neues Werk anlegen“." };
  const { pendingId, choice, type, title } = input.data;
  return guarded(
    () =>
      resolvePendingMatch(
        db,
        pendingId,
        choice === "new" ? { action: "new_work", type, ...(title ? { title } : {}) } : { action: "link", workId: choice },
      ),
    "Zugeordnet.",
  );
}

export async function ignoreMatchAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = IgnoreInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Ungültige Eingabe." };
  return guarded(() => resolvePendingMatch(db, input.data.pendingId, { action: "ignore" }), "Ignoriert.");
}

export async function confirmAllAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = ConfirmAllInput.safeParse(formData.getAll("pendingId"));
  if (!input.success) return { error: "Ungültige Eingabe." };
  const confirmed = await confirmMatches(db, input.data);
  refresh();
  return { message: `${confirmed} Zuordnungen bestätigt.` };
}
