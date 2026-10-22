"use server";

import { cleanText, SourceKey } from "@rwt/core";
import { addSiteDomain, getSiteId, renameSite, setSiteTracking, SiteDomainError, updateSiteRule } from "@rwt/server";
import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { getAuthorizedDb } from "@/lib/dal";

// Server Actions are public POST endpoints: everything from the form is validated here.
const optionalText = (max: number) => z.preprocess((value) => (value === "" ? undefined : value), z.string().max(max).optional());

const TrackingInput = z.object({ siteKey: SourceKey, enabled: z.enum(["true", "false"]) });
const RenameInput = z.object({ siteKey: SourceKey, name: cleanText(100) });
const RuleInput = z.object({
  siteKey: SourceKey,
  chapterPattern: optionalText(1000),
  seriesPattern: optionalText(1000),
  titleSelector: optionalText(1000),
  endSelector: optionalText(1000),
  nextUrlTemplate: optionalText(1000),
  seriesUrlTemplate: optionalText(1000),
  chapterLinkPattern: optionalText(1000),
});
const DomainInput = z.object({ siteKey: SourceKey, domain: z.string().trim().min(1).max(253), makeCurrent: z.literal("on").optional() });

const FIELD_NAMES = {
  chapterPattern: "Kapitel-Muster",
  seriesPattern: "Serien-Muster",
  titleSelector: "Titel-Selektor",
  endSelector: "Kapitelende-Selektor",
  nextUrlTemplate: "Weiterlesen-Vorlage",
  seriesUrlTemplate: "Serienseiten-Vorlage",
  chapterLinkPattern: "Kapitel-Links der Serienseite",
} as const;

const FIELD_ORDER = [
  "chapterPattern",
  "seriesPattern",
  "titleSelector",
  "endSelector",
  "nextUrlTemplate",
  "seriesUrlTemplate",
  "chapterLinkPattern",
] as const;

export async function setTrackingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = TrackingInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Ungültige Eingabe." };
  const id = await getSiteId(db, input.data.siteKey);
  if (!id) return { error: "Seite nicht gefunden." };
  await setSiteTracking(db, id, input.data.enabled === "true");
  refresh();
  return { message: input.data.enabled === "true" ? "Tracking an." : "Tracking aus." };
}

export async function renameSiteAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = RenameInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Bitte einen Namen mit höchstens 100 Zeichen angeben." };
  const id = await getSiteId(db, input.data.siteKey);
  if (!id) return { error: "Seite nicht gefunden." };
  await renameSite(db, id, input.data.name);
  refresh();
  return { message: "Umbenannt." };
}

export async function saveRuleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = RuleInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Ungültige Eingabe." };
  const { siteKey, ...fields } = input.data;
  const id = await getSiteId(db, siteKey);
  if (!id) return { error: "Seite nicht gefunden." };

  const result = await updateSiteRule(db, id, fields);
  if (!result.ok) {
    const details = FIELD_ORDER.flatMap((field) =>
      result.errors[field] ? [`${FIELD_NAMES[field]}: ${result.errors[field]}`] : [],
    );
    return { error: `Nicht gespeichert – ${details.join("; ")}` };
  }
  refresh();
  const pages =
    result.seriesPages === 0
      ? ""
      : ` ${result.seriesPages === 1 ? "1 Serienseite" : `${result.seriesPages} Serienseiten`} neu berechnet; die Prüfung auf neue Kapitel nutzt sie spätestens nach 6 Stunden.`;
  return { message: `Regel gespeichert.${pages} Die Extension übernimmt die Regel beim nächsten Abgleich (spätestens nach 15 Minuten).` };
}

export async function addDomainAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const db = await getAuthorizedDb();
  const input = DomainInput.safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) return { error: "Bitte eine Domain angeben." };
  const id = await getSiteId(db, input.data.siteKey);
  if (!id) return { error: "Seite nicht gefunden." };
  try {
    await addSiteDomain(db, id, input.data.domain, { makeCurrent: input.data.makeCurrent === "on" });
  } catch (error) {
    if (error instanceof SiteDomainError) return { error: error.message };
    throw error;
  }
  refresh();
  return { message: input.data.makeCurrent ? "Umzug eingetragen." : "Domain hinzugefügt." };
}
