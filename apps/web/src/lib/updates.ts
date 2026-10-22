import { type MediaType, type NextUrl, nextChapterUrl, onCurrentDomain, positionUnitFor } from "@rwt/core";
import type { OverviewRow } from "@rwt/server";
import { formatRelative, newChapterCount, toOverviewItem } from "./overview";
import { worksWithNewChaptersLabel } from "./updates-page";

export type UpdatesSort = "recent" | "most";
export type UpdatesShow = "all" | "new";

/** One cover on the updates page (SPEC §4.9); plain strings and numbers only, built on the server. */
export interface UpdateItem {
  id: string;
  title: string;
  /** URL of the stored picture; null shows the title's tile. */
  cover: string | null;
  /** "Kap. 345", the last chapter read. */
  positionLabel: string;
  /** "von 348" when the series page shows more, else null. */
  latestLabel: string | null;
  /** Whole chapters beyond the one read (as the badge in the list, §4.2); 0 for none. */
  newChapters: number;
  /** "Light Novel · Abgeschlossen": what sets the work apart from a comic being read; null for those. */
  note: string | null;
  lastProgressAt: number | null;
  /** Where the picture leads, in a new tab; null: no reading page known, the work is shown greyed out. */
  link: { href: string; label: string; cta: string } | null;
}

/** Manga, Manhwa and Manhua are shown in any case; light novels only with new chapters. */
const COMIC_TYPES: readonly MediaType[] = ["manga", "manhwa", "manhua"];
const STATUS_NOTES: Partial<Record<OverviewRow["status"], string>> = { completed: "Abgeschlossen", dropped: "Abgebrochen" };

/** "1 neues Kapitel", "3 neue Kapitel". */
export const newChaptersLabel = (count: number) => (count === 1 ? "1 neues Kapitel" : `${count} neue Kapitel`);

/**
 * Where the picture leads (SPEC §4.9): with new chapters the first unread one, n+1 – the same
 * address as "Weiterlesen" in the list (§4.4) –, otherwise the newest chapter, which is the last
 * one read (`last_url`, on the source's current domain). Null without a reading page; only http(s).
 */
export function updateLink(row: OverviewRow): NextUrl | null {
  if (newChapterCount(row.chapter, row.latestChapter) !== null) {
    return nextChapterUrl({
      lastUrl: row.lastUrl,
      chapter: row.chapter,
      seriesUrl: row.seriesUrl,
      template: row.source?.nextUrlTemplate,
      currentDomain: row.source?.currentDomain,
    });
  }
  const last = onCurrentDomain(row.lastUrl, row.source?.currentDomain);
  return last ? { kind: "last", href: last } : null;
}

/**
 * The work as a cover on the updates page, or null when the page leaves it out (SPEC §4.9): only
 * types counted in chapters and never `Kap. ?`; Manga, Manhwa and Manhua being read always,
 * finished and dropped works and light novels only with new chapters.
 */
export function toUpdateItem(row: OverviewRow, now: Date): UpdateItem | null {
  if (positionUnitFor(row.type) !== "chapter" || row.chapter === null) return null;
  const newChapters = newChapterCount(row.chapter, row.latestChapter) ?? 0;
  if (newChapters === 0 && (row.status !== "reading" || !COMIC_TYPES.includes(row.type))) return null;
  const overview = toOverviewItem(row, now);

  const note = [row.type === "light_novel" ? "Light Novel" : null, STATUS_NOTES[row.status] ?? null].filter((part) => part !== null);
  return {
    id: row.id,
    title: row.title,
    cover: overview.cover,
    positionLabel: overview.positionLabel,
    latestLabel: newChapters > 0 && row.latestChapter !== null ? `von ${row.latestChapter}` : null,
    newChapters,
    note: note.length > 0 ? note.join(" · ") : null,
    lastProgressAt: overview.lastProgressAt,
    link: linkFor(row, newChapters),
  };
}

function linkFor(row: OverviewRow, newChapters: number): UpdateItem["link"] {
  const target = updateLink(row);
  if (!target || row.chapter === null) return null;
  const extra = newChapters > 0 ? `${newChaptersLabel(newChapters)}, öffnet neuen Tab` : "öffnet neuen Tab";
  if (target.kind === "next") {
    const next = Math.floor(row.chapter) + 1;
    return { href: target.href, label: `${row.title}: Kapitel ${next} lesen (${extra})`, cta: `Kap. ${next} lesen` };
  }
  return { href: target.href, label: `${row.title}: zuletzt gelesenes Kapitel ${row.chapter} öffnen (${extra})`, cta: "Zuletzt gelesen" };
}

const byTitle = (a: UpdateItem, b: UpdateItem) => a.title.localeCompare(b.title, "de", { sensitivity: "base" });
// Last read first; works without activity (just imported) go last.
const byRecent = (a: UpdateItem, b: UpdateItem) => (b.lastProgressAt ?? -Infinity) - (a.lastProgressAt ?? -Infinity) || byTitle(a, b);
const byMost = (a: UpdateItem, b: UpdateItem) => b.newChapters - a.newChapters || byRecent(a, b);

/**
 * The page's two sections: works with new chapters on top ("Neue Kapitel"), all others below.
 * "Meiste neue" orders by the number of new chapters, then like "Zuletzt gelesen"; "Nur neue"
 * leaves the second section empty. Runs in the browser, without a round trip.
 */
export function updateSections(
  items: readonly UpdateItem[],
  { sort, show }: { sort: UpdatesSort; show: UpdatesShow },
): { fresh: UpdateItem[]; rest: UpdateItem[] } {
  const order = sort === "most" ? byMost : byRecent;
  return {
    fresh: items.filter((item) => item.newChapters > 0).sort(order),
    rest: show === "new" ? [] : items.filter((item) => item.newChapters === 0).sort(order),
  };
}

/** "5 Werke mit neuen Kapiteln · 13 Kapitel zu lesen". */
export function updatesSummary(items: readonly UpdateItem[]): string {
  const fresh = items.filter((item) => item.newChapters > 0);
  if (fresh.length === 0) return "Gerade nichts Neues";
  const chapters = fresh.reduce((sum, item) => sum + item.newChapters, 0);
  return `${worksWithNewChaptersLabel(fresh.length)} · ${chapters} Kapitel zu lesen`;
}

/** Shows whether the extension checks at all (§7.11): its newest report. */
export function lastCheckLabel(at: Date | null, now: Date): string {
  return at === null ? "Serienseiten noch nie geprüft" : `Serienseiten zuletzt geprüft ${formatRelative(at, now)}`;
}
