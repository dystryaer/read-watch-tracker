import { positionUnitFor } from "@rwt/core";
import { newChapterCount, type OverviewItem } from "./overview";
import { type StepperState, stepperLabel, stepPosition } from "./stepper";

/** The overview as a cover shelf (default) or as the list of rows (SPEC §4.1). */
export type OverviewView = "shelf" | "list";

export const VIEW_COOKIE = "rwt-overview-view";
const YEAR_SECONDS = 365 * 24 * 60 * 60;

/** The view the browser remembered; anything else is the shelf. */
export function parseOverviewView(raw: string | undefined): OverviewView {
  return raw === "list" ? "list" : "shelf";
}

/**
 * A cookie, not localStorage: the server reads it and renders the remembered view right away,
 * so the page never shows the shelf first and then flips to the list.
 */
export function viewCookie(view: OverviewView): string {
  return `${VIEW_COOKIE}=${view}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax`;
}

export interface CoverPosition {
  /** "Kap. 421", "S1 · F14", "43 %", "Kap. ?". */
  label: string;
  unknown: boolean;
  /** "/ 423" beside a chapter: the newest one on the series page, unless already passed. */
  latest: number | null;
  /** "2 neu", counted from the position shown, so a step forward counts down at once. */
  fresh: number | null;
}

/** What a card's picture says about the position; `value` is the stepper's current one. */
export function coverPosition(
  item: Pick<OverviewItem, "positionLabel" | "positionUnknown" | "stepper" | "latestChapter">,
  value: number | null,
): CoverPosition {
  const { stepper } = item;
  if (!stepper) return { label: item.positionLabel, unknown: item.positionUnknown, latest: null, fresh: null };
  if (stepper.unit === "episode" || value === null || item.latestChapter === null) {
    return { label: stepperLabel({ ...stepper, value }), unknown: value === null, latest: null, fresh: null };
  }
  return {
    label: stepperLabel({ ...stepper, value }),
    unknown: false,
    latest: item.latestChapter >= Math.floor(value) ? item.latestChapter : null,
    fresh: newChapterCount(value, item.latestChapter),
  };
}

export type CardAction =
  /** The continue link; phones show `short` ("Weiter ›") and keep the rest for screen readers. */
  | { kind: "continue"; href: string; label: string; short: string }
  /** "Stand setzen ›" to the detail page, for a position that is not known. */
  | { kind: "set-position"; href: string }
  /** Plain text where no button makes sense: "Abgeschlossen", "Stand: 43 %", "Keine Seite". */
  | { kind: "note"; label: string };

const SHORT_LABELS: Record<string, string> = { Weiterlesen: "Weiter", "Zuletzt gelesen": "Zuletzt" };

/** The row under a card's picture, and whether it gets a "+" (next chapter or episode read). */
export function cardAction(
  item: Pick<OverviewItem, "id" | "type" | "status" | "positionLabel" | "positionUnknown" | "continueLink" | "source" | "stepper">,
): { action: CardAction; plus: boolean } {
  if (item.status === "completed") return { action: { kind: "note", label: "Abgeschlossen" }, plus: false };
  if (item.status === "dropped") return { action: { kind: "note", label: "Abgebrochen" }, plus: false };
  if (item.positionUnknown) return { action: { kind: "set-position", href: `/works/${item.id}` }, plus: false };
  if (positionUnitFor(item.type) === "percent") return { action: { kind: "note", label: `Stand: ${item.positionLabel}` }, plus: false };
  const plus = item.stepper !== null;
  const link = item.continueLink;
  if (link) {
    return { action: { kind: "continue", href: link.href, label: link.label, short: SHORT_LABELS[link.label] ?? link.label }, plus };
  }
  return { action: { kind: "note", label: item.source ? "Kein Link" : "Keine Seite" }, plus };
}

/** Accessible name of the "+" under the picture: which chapter or episode it marks. */
export function plusLabel(title: string, stepper: StepperState, value: number | null): string {
  const next = stepPosition(stepper.unit, value, 1);
  return stepper.unit === "chapter"
    ? `${title}: Kapitel ${next} als gelesen markieren`
    : `${title}: Folge ${next} als gesehen markieren`;
}
