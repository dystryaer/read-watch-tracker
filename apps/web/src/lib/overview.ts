import { type MediaType, nextChapterUrl, normalizeTitle, positionUnitFor, safeHref } from "@rwt/core";
import type { OverviewRow } from "@rwt/server";
import type { StepperState } from "./stepper";

export type Tab = "all" | "comics" | "novels" | "ebooks" | "video";
export type StatusFilter = "reading" | "completed" | "dropped" | "all";
export type SortOrder = "recent" | "title";

export interface OverviewFilter {
  tab: Tab;
  status: StatusFilter;
  query: string;
  unknownOnly: boolean;
  sort: SortOrder;
}

export interface OverviewItem {
  id: string;
  title: string;
  type: MediaType;
  typeLabel: string;
  status: OverviewRow["status"];
  positionLabel: string;
  positionUnknown: boolean;
  chapter: number | null;
  /** E-book progress for the quick-update slider. */
  percent: number | null;
  /** −/+ control for chapter and episode types; null for e-books and movies. */
  stepper: StepperState | null;
  source: { label: string; initial: string } | null;
  lastActivity: { iso: string; label: string } | null;
  continueLink: { href: string; label: string } | null;
  /** Normalized title and aliases, one per line. */
  searchText: string;
  lastProgressAt: number | null;
}

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
  light_novel: "Novel",
  ebook: "E-Book",
  anime: "Anime",
  series: "Serie",
  movie: "Film",
};

const TABS: Record<Exclude<Tab, "all">, MediaType[]> = {
  comics: ["manga", "manhwa", "manhua"],
  novels: ["light_novel"],
  ebooks: ["ebook"],
  video: ["anime", "series", "movie"],
};

const decimal = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const relative = new Intl.RelativeTimeFormat("de", { numeric: "auto", style: "short" });

function position(row: OverviewRow): { label: string; unknown: boolean } {
  switch (positionUnitFor(row.type)) {
    case "chapter":
      // Chapter numbers are identifiers ("105.5"), not quantities, so no German decimal comma.
      return row.chapter === null ? { label: "Kap. ?", unknown: true } : { label: `Kap. ${row.chapter}`, unknown: false };
    case "episode":
      if (row.episode === null) return { label: "F ?", unknown: true };
      return { label: row.season === null ? `F${row.episode}` : `S${row.season} · F${row.episode}`, unknown: false };
    case "percent":
      return row.percent === null ? { label: "? %", unknown: true } : { label: `${decimal.format(row.percent)} %`, unknown: false };
    case "none":
      return { label: row.status === "completed" ? "Gesehen" : "Film", unknown: false };
  }
}

function continueLink(row: OverviewRow): OverviewItem["continueLink"] {
  if (positionUnitFor(row.type) === "episode" || row.type === "movie") {
    const href = safeHref(row.seriesUrl) ?? safeHref(row.lastUrl);
    return href ? { href, label: "Öffnen" } : null;
  }
  const next = nextChapterUrl({
    lastUrl: row.lastUrl,
    chapter: row.chapter,
    seriesUrl: row.seriesUrl,
    template: row.source?.nextUrlTemplate,
    currentDomain: row.source?.currentDomain,
  });
  if (!next) return null;
  return { href: next.href, label: next.kind === "next" ? "Weiterlesen" : "Zuletzt gelesen" };
}

function stepperFor(row: OverviewRow): StepperState | null {
  const unit = positionUnitFor(row.type);
  if (unit === "chapter") return { unit, value: row.chapter, season: null };
  if (unit === "episode") return { unit, value: row.episode, season: row.season };
  return null;
}

/** "vor 2 Std.", "gestern", "vor 3 Tagen" (SPEC §4.1). */
export function formatRelative(date: Date, now: Date): string {
  // ICU mixes in (narrow) no-break spaces for some units only; plain spaces keep output stable.
  return relativeLabel(date, now).replace(/\s+/g, " ");
}

function relativeLabel(date: Date, now: Date): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "gerade eben";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86_400) return relative.format(Math.round(seconds / 86_400), "day");
  if (abs < 30 * 86_400) return relative.format(Math.round(seconds / (7 * 86_400)), "week");
  if (abs < 365 * 86_400) return relative.format(Math.round(seconds / (30 * 86_400)), "month");
  return relative.format(Math.round(seconds / (365 * 86_400)), "year");
}

export function toOverviewItem(row: OverviewRow, now: Date): OverviewItem {
  const { label, unknown } = position(row);
  const sourceName = row.source?.kind === "website" ? (row.source.currentDomain ?? row.source.name) : row.source?.name;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    typeLabel: MEDIA_TYPE_LABELS[row.type],
    status: row.status,
    positionLabel: label,
    positionUnknown: unknown,
    chapter: row.chapter,
    percent: row.percent,
    stepper: stepperFor(row),
    source:
      row.source && sourceName
        ? { label: sourceName, initial: /\p{L}/u.exec(row.source.name)?.[0]?.toUpperCase() ?? "?" }
        : null,
    lastActivity: row.lastProgressAt
      ? { iso: row.lastProgressAt.toISOString(), label: formatRelative(row.lastProgressAt, now) }
      : null,
    continueLink: continueLink(row),
    searchText: [row.title, ...row.aliases].map(normalizeTitle).join("\n"),
    lastProgressAt: row.lastProgressAt?.getTime() ?? null,
  };
}

const byTitle = (a: OverviewItem, b: OverviewItem) => a.title.localeCompare(b.title, "de", { sensitivity: "base" });

export function filterAndSort(items: OverviewItem[], filter: OverviewFilter): OverviewItem[] {
  const query = normalizeTitle(filter.query);
  const tabTypes = filter.tab === "all" ? null : TABS[filter.tab];
  const visible = items.filter(
    (item) =>
      (tabTypes === null || tabTypes.includes(item.type)) &&
      (filter.status === "all" || item.status === filter.status) &&
      (!filter.unknownOnly || item.positionUnknown) &&
      (query === "" || item.searchText.includes(query)),
  );
  if (filter.sort === "title") return visible.sort(byTitle);
  // Most recent first; works without activity (e.g. just imported) go last.
  return visible.sort((a, b) => (b.lastProgressAt ?? -Infinity) - (a.lastProgressAt ?? -Infinity) || byTitle(a, b));
}

const QUICK_TYPES: MediaType[] = ["light_novel", "ebook"];
const QUICK_LIMIT = 8;

/**
 * The quick-update screen (SPEC §9.3): the eight most recently active light novels and e-books
 * still being read, so the next chapter or percentage is two taps away.
 */
export function quickUpdateItems(items: OverviewItem[]): OverviewItem[] {
  return items
    .filter((item) => QUICK_TYPES.includes(item.type) && item.status === "reading")
    .sort((a, b) => (b.lastProgressAt ?? -1) - (a.lastProgressAt ?? -1) || byTitle(a, b))
    .slice(0, QUICK_LIMIT);
}

const REMIND_AFTER_DAYS = 7;
const DAY_MS = 86_400_000;

/** The WebNovel hint on the core screen (SPEC §9.1), or null when no reminder is due. */
export function webnovelReminder(status: { lastSync: Date | null; readsOnWebnovel: boolean }, now: Date): string | null {
  if (status.lastSync === null) return status.readsOnWebnovel ? "WebNovel wurde noch nie synchronisiert." : null;
  const age = now.getTime() - status.lastSync.getTime();
  return age > REMIND_AFTER_DAYS * DAY_MS ? `WebNovel zuletzt vor ${Math.floor(age / DAY_MS)} Tagen synchronisiert.` : null;
}
