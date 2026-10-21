import { comparePositions, MAX_TEXT_LENGTH, parseEpisode, streamingSeriesKey } from "@rwt/core";
import { serviceForUrl, serviceLink, type StreamingServiceKey, textBeforeLabel } from "./services";

/** One watched episode as a history page lists it (SPEC §7.6). */
export interface HistoryEntry {
  seriesTitle: string;
  season: number | null;
  episode: number;
  seriesUrl: string | null;
}

export const MAX_HISTORY_ENTRIES = 500;

interface HistoryPage {
  isHistory(url: URL): boolean;
  /** Card selectors of the known layout; generic leaf cards are always tried as well. */
  cards: string[];
}

// Synthetic layouts (A10): unverified until samples of the real pages replace the fixtures.
// Disney+ has no known history page (SPEC §7.6, Spike S1).
const HISTORY_PAGES: Partial<Record<StreamingServiceKey, HistoryPage>> = {
  netflix: { isHistory: (url) => url.pathname.startsWith("/viewingactivity"), cards: ["li.retableRow", "li"] },
  primevideo: { isHistory: (url) => url.pathname.includes("/settings/watch-history"), cards: [".watch-history-item", "li"] },
  crunchyroll: {
    isHistory: (url) => url.hostname === "www.crunchyroll.com" && url.pathname.startsWith("/history"),
    cards: [".history-card", '[data-t="history-card"]', "article", "li"],
  },
};

// Dates next to an entry ("21.10.26", "21. Oktober 2026", "vor 2 Tagen") are never the series –
// but titles such as "1899", "9-1-1" or "Vor uns das Meer" are.
const DATE_SHAPES = [
  /^\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4})$/u,
  /^\d{1,2}\.\s*\p{L}+\.?\s*\d{4}$/u,
  /^\p{L}+\.?\s+\d{1,2},?\s+\d{4}$/u,
  /^vor\s+\d+\s+\p{L}+$/iu,
  /^\d+\s+\p{L}+\s+ago$/iu,
];
const isDate = (text: string) => DATE_SHAPES.some((shape) => shape.test(text));

function textsOf(card: Element): string[] {
  const texts: string[] = [];
  const walker = card.ownerDocument.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
    if (text !== "") texts.push(text);
  }
  return texts;
}

/**
 * Reads a card by content rather than by class names: the first text that names an episode is
 * the label, the first text before it that is no date is the series; "Dark: Staffel 2: Folge 5"
 * carries both in one text. Cards without an episode number (Netflix often lists only the
 * episode's title) are skipped. The card's first link on the service is the series page.
 */
function entryOf(card: Element, base: string, key: StreamingServiceKey): HistoryEntry | null {
  const texts = textsOf(card);
  const labelIndex = texts.findIndex((text) => parseEpisode(text) !== null);
  const label = texts[labelIndex];
  const episode = label === undefined ? null : parseEpisode(label);
  if (!label || !episode) return null;

  const seriesTitle = texts.slice(0, labelIndex).find((text) => !isDate(text)) ?? textBeforeLabel(label);
  if (seriesTitle === "") return null;
  const seriesUrl = [...card.querySelectorAll("a[href]")].map((link) => serviceLink(link.getAttribute("href"), base, key)).find(Boolean) ?? null;
  return { seriesTitle, ...episode, seriesUrl };
}

/** The innermost elements that hold an episode label and some text before it: cards of any markup. */
function leafCards(doc: Document): Element[] {
  const holders = [...doc.body.querySelectorAll("*")].filter((element) => {
    const texts = textsOf(element);
    return texts.findIndex((text) => parseEpisode(text) !== null) > 0;
  });
  return holders.filter((holder) => !holders.some((other) => other !== holder && holder.contains(other)));
}

export function isHistoryPage(url: URL): boolean {
  const service = serviceForUrl(url);
  return Boolean(service && HISTORY_PAGES[service.key]?.isHistory(url));
}

/** The entries of a service's history page, or null when the page is none. The reading that finds the most wins. */
export function readHistory(doc: Document, url: URL): HistoryEntry[] | null {
  const service = serviceForUrl(url);
  const page = service ? HISTORY_PAGES[service.key] : undefined;
  if (!service || !page?.isHistory(url)) return null;

  const readings = [...page.cards.map((selector) => [...doc.querySelectorAll(selector)]), leafCards(doc)].map((cards) =>
    cards.flatMap((card) => entryOf(card, url.href, service.key) ?? []),
  );
  const best = readings.reduce((most, reading) => (reading.length > most.length ? reading : most), []);
  return best.slice(0, MAX_HISTORY_ENTRIES);
}

/** The furthest episode per series (by streaming key), in order of first appearance. */
export function latestPerSeries(entries: HistoryEntry[]): HistoryEntry[] {
  const latest = new Map<string, HistoryEntry>();
  for (const entry of entries) {
    const key = streamingSeriesKey(entry.seriesTitle);
    const known = latest.get(key);
    const position = (item: HistoryEntry) => ({ unit: "episode" as const, season: item.season, episode: item.episode });
    if (!known || comparePositions(position(entry), position(known)) > 0) latest.set(key, entry);
  }
  return [...latest.values()];
}
