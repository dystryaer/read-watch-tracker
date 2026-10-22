import { type MediaType, nextChapterUrl, positionUnitFor, safeHref } from "@rwt/core";
import type { WorkDetail } from "@rwt/server";

/**
 * The big button in the detail page's head (SPEC §4.3, §4.4): "Weiterlesen · Kap. 422" when the
 * next chapter's address can be built, "Zuletzt gelesen · Kap. 421" otherwise, "Öffnen" for
 * series, anime and films; null without a usable address.
 */
export function headContinueLink(
  work: { type: MediaType; chapter: number | null; lastUrl: string | null },
  lastSource: WorkDetail["lastSource"],
): { href: string; label: string } | null {
  const unit = positionUnitFor(work.type);
  if (unit === "episode" || unit === "none") {
    const href = safeHref(lastSource?.seriesUrl) ?? safeHref(work.lastUrl);
    return href ? { href, label: "Öffnen" } : null;
  }
  const next = nextChapterUrl({
    lastUrl: work.lastUrl,
    chapter: work.chapter,
    seriesUrl: lastSource?.seriesUrl,
    template: lastSource?.nextUrlTemplate,
    currentDomain: lastSource?.currentDomain,
  });
  if (!next) return null;
  if (next.kind === "next" && work.chapter !== null) {
    return { href: next.href, label: `Weiterlesen · Kap. ${Math.floor(work.chapter) + 1}` };
  }
  return { href: next.href, label: work.chapter === null ? "Zuletzt gelesen" : `Zuletzt gelesen · Kap. ${work.chapter}` };
}
