import { cleanChapterTitle, detectChapterFromUrl, MAX_TEXT_LENGTH, MAX_URL_LENGTH, type SiteRule } from "@rwt/core";
import type { Detection } from "@/lib/messages";

function query(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector);
  } catch {
    return null; // an invalid selector in a site rule must not break detection
  }
}

function cleaned(text: string | null | undefined): string | null {
  const title = text ? cleanChapterTitle(text) : null;
  return title ? title.slice(0, MAX_TEXT_LENGTH) : null;
}

// SPEC §7.3: rule selector → og:title → h1 → document title (inside the URL detection).
function titleFromPage(doc: Document, rule: SiteRule | undefined): string | null {
  if (rule?.titleSelector) {
    const title = cleaned(query(doc, rule.titleSelector)?.textContent);
    if (title) return title;
  }
  return (
    cleaned(query(doc, 'meta[property="og:title"]')?.getAttribute("content")) ?? cleaned(query(doc, "h1")?.textContent)
  );
}

const COVER_META = ['meta[property="og:image:secure_url"]', 'meta[property="og:image"]', 'meta[name="twitter:image"]'];

/**
 * The page's preview image, which reading sites set to the series cover. Only https: the tracker
 * downloads it and fetches nothing else.
 */
function coverFromPage(doc: Document, pageUrl: string): string | null {
  for (const selector of COVER_META) {
    const content = query(doc, selector)?.getAttribute("content")?.trim();
    if (!content) continue;
    try {
      const cover = new URL(content, pageUrl);
      return cover.protocol === "https:" && !cover.username && !cover.password && cover.href.length <= MAX_URL_LENGTH ? cover.href : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Chapter page detection in the browser: URL rules from core plus the page's title and cover. */
export function detectChapter(doc: Document, url: string, rule?: SiteRule): Detection | null {
  const detection = detectChapterFromUrl(url, doc.title, rule);
  if (!detection) return null;
  return {
    chapter: detection.chapter,
    seriesKey: detection.seriesKey,
    title: titleFromPage(doc, rule) ?? (detection.title ? detection.title.slice(0, MAX_TEXT_LENGTH) : null),
    seriesUrl: detection.seriesUrl,
    coverUrl: coverFromPage(doc, url),
  };
}
