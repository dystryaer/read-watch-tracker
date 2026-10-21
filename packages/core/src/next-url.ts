import { parseHttpUrl } from "./safe-url";
import { isHostname } from "./site-rule";

export interface NextUrlInput {
  lastUrl: string | null;
  /** Last read chapter; null when unknown. */
  chapter: number | null;
  seriesUrl?: string | null;
  template?: string | null;
  /** Current domain of the source after a domain move (SPEC §4.4 rule 4). */
  currentDomain?: string | null;
}

export interface NextUrl {
  /** "next" opens chapter n+1, "last" re-opens the last read chapter. */
  kind: "next" | "last";
  href: string;
}

/** Link for the "Weiterlesen" button (SPEC §4.4): template, then generic rule, then last URL. */
export function nextChapterUrl(input: NextUrlInput): NextUrl | null {
  const last = moveToDomain(parseHttpUrl(input.lastUrl), input.currentDomain);
  const series = moveToDomain(parseHttpUrl(input.seriesUrl), input.currentDomain);

  if (input.chapter !== null) {
    const next = Math.floor(input.chapter) + 1;
    const fromTemplate = input.template
      ? fillTemplate(input.template, {
          origin: (last ?? series)?.origin,
          seriesUrl: series?.href.replace(/\/+$/, ""),
          series: series ? lastSegment(series) : undefined,
          next: String(next),
        })
      : null;
    if (fromTemplate) return { kind: "next", href: fromTemplate };

    const generic = last ? replaceChapterInLastSegment(last, input.chapter, next) : null;
    if (generic) return { kind: "next", href: generic };
  }
  return last ? { kind: "last", href: last.href } : null;
}

function moveToDomain(url: URL | null, domain: string | null | undefined): URL | null {
  if (url === null || !domain || !isHostname(domain) || url.hostname === domain) return url;
  const moved = new URL(url.href);
  moved.hostname = domain;
  moved.port = ""; // the old domain's port says nothing about the new one
  return moved;
}

function fillTemplate(template: string, values: Record<string, string | undefined>): string | null {
  let missing = false;
  const filled = template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) missing = true;
    return value ?? "";
  });
  return missing ? null : (parseHttpUrl(filled)?.href ?? null);
}

function lastSegment(url: URL): string | undefined {
  return url.pathname.split("/").findLast((segment) => segment !== "");
}

// Matches the chapter as a whole number, so 12 never matches inside 1200; decimals may be
// written as 105.5, 105-5 or 105_5 in URLs.
function chapterNumberPattern(chapter: number): RegExp {
  const [whole, fraction] = String(chapter).split(".");
  const number = fraction === undefined ? whole : `${whole}[._-]${fraction}`;
  return new RegExp(String.raw`(?<!\d)${number}(?!\d)`, "g");
}

function replaceChapterInLastSegment(url: URL, chapter: number, next: number): string | null {
  const segments = url.pathname.split("/");
  const index = segments.findLastIndex((segment) => segment !== "");
  const segment = segments[index];
  if (segment === undefined) return null;

  const pattern = chapterNumberPattern(chapter);
  if (segment.match(pattern)?.length !== 1) return null; // ambiguous or absent: no guessing
  segments[index] = segment.replace(pattern, String(next));

  const nextUrl = new URL(url.href);
  nextUrl.pathname = segments.join("/");
  return nextUrl.href;
}
