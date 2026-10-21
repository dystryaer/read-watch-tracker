import { parseHttpUrl } from "./safe-url";
import { normalizeSeriesKey } from "./series-key";
import { compileRulePattern, type SiteRule } from "./site-rule";

export interface UrlDetection {
  chapter: number;
  /** Normalized; becomes `externalKey` of the event. */
  seriesKey: string;
  /** Series title cleaned from the page title, or null. */
  title: string | null;
  seriesUrl: string | null;
}

const MAX_CHAPTER = 99999.99;
const MAX_PAGE_TITLE_LENGTH = 1000;
/** Bounds the work a user-written rule pattern can cause, on top of the shape checks in SiteRule. */
const MAX_RULE_INPUT_LENGTH = 512;

// Lookbehind instead of \b so "match-12" or "epic" never count as "ch"/"ep" tokens.
const PATH_CHAPTER_TOKEN =
  /(?<![a-z])(?:chapter|chap|ch|episode|ep|kapitel)[-_./ ]?(\d{1,6}(?:[.-]\d{1,2})?)(?!\d)/gi;
const TITLE_CHAPTER_TOKEN =
  /(?<![a-z])(?:chapter|chap|ch\.?|episode|ep\.?|kapitel)\s*(\d{1,6}(?:\.\d{1,2})?)(?!\d)/i;
const TITLE_SEPARATOR = /\s+(?:[-–—|·]|::)\s+|\s*\|\s*/;
const VOLUME_PREFIX = /^(?:vol(?:ume)?|v)[-_.]?\d+[-_.]*$/i;
const GENERIC_SEGMENTS = new Set([
  "manga",
  "manhwa",
  "manhua",
  "webtoon",
  "webtoons",
  "comic",
  "comics",
  "series",
  "title",
  "titles",
  "read",
  "reader",
  "viewer",
  "book",
  "books",
  "novel",
]);

interface ChapterMatch {
  chapter: number;
  /** Index in the path where the chapter token starts; null when found in the page title. */
  pathIndex: number | null;
}

/**
 * Finds chapter number and series of a chapter page from its URL (and page title as fallback).
 * Rule fields replace only their own step (SPEC §7.3); a rule's chapter pattern that does not
 * match means "no chapter" rather than a generic guess.
 */
export function detectChapterFromUrl(
  input: string | URL,
  pageTitle: string,
  rule?: SiteRule,
): UrlDetection | null {
  const url = parseHttpUrl(typeof input === "string" ? input : input.href);
  if (url === null) return null;
  const path = url.pathname;
  const title = cleanChapterTitle(pageTitle);

  const rulePath = path.slice(0, MAX_RULE_INPUT_LENGTH);

  const chapterMatch = rule?.chapterPattern
    ? matchRuleChapter(rulePath, rule.chapterPattern)
    : (matchPathChapter(path) ?? matchTitleChapter(pageTitle));
  if (chapterMatch === null) return null;

  const series = rule?.seriesPattern
    ? matchRuleSeries(rulePath, rule.seriesPattern)
    : chapterMatch.pathIndex === null
      ? null
      : seriesFromPath(path, chapterMatch.pathIndex);

  const seriesKey = normalizeSeriesKey(series?.raw ?? "") || normalizeSeriesKey(title ?? "");
  if (seriesKey === "") return null;

  return {
    chapter: chapterMatch.chapter,
    seriesKey,
    title,
    seriesUrl: series?.path ? `${url.origin}${series.path}` : null,
  };
}

function toChapter(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw.replace(/[_-]/, "."));
  if (!Number.isFinite(value) || value < 0 || value > MAX_CHAPTER) return null;
  return Math.round(value * 100) / 100;
}

function matchPathChapter(path: string): ChapterMatch | null {
  const last = [...path.matchAll(PATH_CHAPTER_TOKEN)].at(-1);
  if (last === undefined) return null;
  const chapter = toChapter(last[1]);
  return chapter === null ? null : { chapter, pathIndex: last.index };
}

function matchTitleChapter(pageTitle: string): ChapterMatch | null {
  const match = TITLE_CHAPTER_TOKEN.exec(pageTitle.slice(0, MAX_PAGE_TITLE_LENGTH));
  const chapter = toChapter(match?.[1]);
  return chapter === null ? null : { chapter, pathIndex: null };
}

function matchRuleChapter(path: string, pattern: string): ChapterMatch | null {
  const match = compileRulePattern(pattern)?.exec(path);
  if (!match) return null;
  const chapter = toChapter(match[1]);
  // A match that starts with "/" begins a new segment; the series is in the segments before it.
  const pathIndex = path[match.index] === "/" ? match.index + 1 : match.index;
  return chapter === null ? null : { chapter, pathIndex };
}

function matchRuleSeries(path: string, pattern: string): { raw: string; path: string } | null {
  const match = compileRulePattern(pattern, "id")?.exec(path);
  const span = match?.indices?.[1];
  if (!match?.[1] || !span) return null;
  return { raw: match[1], path: path.slice(0, span[1]) };
}

/**
 * The series is the text before the chapter token in the same segment, else the nearest segment
 * that is neither generic (/manga/) nor a volume (/vol-3/).
 */
function seriesFromPath(path: string, tokenIndex: number): { raw: string; path: string | null } | null {
  const segments = path.slice(0, tokenIndex).split("/");
  const partial = (segments.pop() ?? "").replace(/[-_.]+$/, "");
  if (/[a-z0-9]/i.test(partial) && !VOLUME_PREFIX.test(partial)) return { raw: partial, path: null };

  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i] ?? "";
    if (segment === "" || GENERIC_SEGMENTS.has(segment.toLowerCase()) || VOLUME_PREFIX.test(segment)) continue;
    return { raw: segment, path: segments.slice(0, i + 1).join("/") };
  }
  return null;
}

/** Series title from a page title such as "Overgeared Chapter 345 - Asura Scans". */
export function cleanChapterTitle(raw: string): string | null {
  const text = raw.slice(0, MAX_PAGE_TITLE_LENGTH).replace(/\s+/g, " ").trim();
  const parts = text
    .split(TITLE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) return null;

  const tokenPart = parts.findIndex((part) => TITLE_CHAPTER_TOKEN.test(part));
  let candidate: string;
  if (tokenPart === -1) {
    candidate = parts[0] ?? "";
  } else {
    const part = parts[tokenPart] ?? "";
    candidate = part.slice(0, part.search(TITLE_CHAPTER_TOKEN)).trim();
    // "Overgeared - Chapter 345" or "Chapter 345 | Overgeared": the title is a neighbouring part.
    if (candidate === "") candidate = parts[tokenPart - 1] ?? parts[tokenPart + 1] ?? "";
  }

  const cleaned = candidate
    .replace(/^read\s+/i, "")
    .replace(/(?:\s+(?:online|free|english|raw))+$/i, "")
    .replace(/[\s\-–—|:·]+$/, "")
    .trim();
  return cleaned === "" ? null : cleaned;
}
