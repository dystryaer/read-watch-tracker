import { cleanChapterTitle, detectChapterFromUrl, MAX_TEXT_LENGTH, type SiteRule } from "@rwt/core";
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

/** Chapter page detection in the browser: URL rules from core plus the page's title. */
export function detectChapter(doc: Document, url: string, rule?: SiteRule): Detection | null {
  const detection = detectChapterFromUrl(url, doc.title, rule);
  if (!detection) return null;
  return {
    chapter: detection.chapter,
    seriesKey: detection.seriesKey,
    title: titleFromPage(doc, rule) ?? (detection.title ? detection.title.slice(0, MAX_TEXT_LENGTH) : null),
    seriesUrl: detection.seriesUrl,
  };
}
