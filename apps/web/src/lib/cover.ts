/** The work's picture on this server; the version makes a changed picture a new URL (cached forever). */
export function coverSrc(workId: string, version: number | null): string | null {
  return version === null ? null : `/works/${workId}/cover?v=${version}`;
}

export const TILE_TONES = 8;

// Letters and digits; an apostrophe between them stays in the word ("Ranker’s", "I’ll").
const WORD = /[\p{L}\p{N}]+(?:['’ʼ][\p{L}\p{N}]+)*/gu;

/**
 * The tile for a work without a picture: up to two initials ("Solo Leveling" → "SL",
 * "Ranker’s Return" → "RR") and one of `TILE_TONES` colors, the same for a title every time.
 */
export function coverTile(title: string): { initials: string; tone: number } {
  const words = title.match(WORD) ?? [];
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  let hash = 0;
  for (const char of title) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return { initials: initials || "?", tone: hash % TILE_TONES };
}
