/**
 * Name and path of the updates page (SPEC §4.9), in one place for navigation, heading and tests.
 * Next.js takes the path from the route folder: `app/(app)/updates/` must match (a test checks it).
 * A module of its own, so the navigation does not pull the page's logic into every page's bundle.
 */
export const UPDATES_PAGE = { path: "/updates", label: "Updates" } as const;

/** The navigation's number in words, for screen readers: "5 Werke mit neuen Kapiteln". */
export function worksWithNewChaptersLabel(count: number): string {
  return count === 1 ? "1 Werk mit neuen Kapiteln" : `${count} Werke mit neuen Kapiteln`;
}
