import type { MediaType, Position } from "./event";

const UNIT_BY_MEDIA_TYPE = {
  manga: "chapter",
  manhwa: "chapter",
  manhua: "chapter",
  light_novel: "chapter",
  anime: "episode",
  series: "episode",
  ebook: "percent",
  movie: "none",
} as const satisfies Record<MediaType, Position["unit"]>;

export class PositionUnitMismatchError extends Error {
  constructor(a: Position["unit"], b: Position["unit"]) {
    super(`Cannot compare a ${a} position with a ${b} position`);
    this.name = "PositionUnitMismatchError";
  }
}

export function positionUnitFor(mediaType: MediaType): Position["unit"] {
  return UNIT_BY_MEDIA_TYPE[mediaType];
}

export function fitsMediaType(mediaType: MediaType, position: Position): boolean {
  return positionUnitFor(mediaType) === position.unit;
}

/** Positive when `a` is further than `b`, negative when behind, 0 when equal. */
export function comparePositions(a: Position, b: Position): number {
  if (a.unit === "chapter" && b.unit === "chapter") return a.chapter - b.chapter;
  if (a.unit === "percent" && b.unit === "percent") return a.percent - b.percent;
  if (a.unit === "episode" && b.unit === "episode") {
    // A side without a season (e.g. the Shield) is assumed to be in the other side's season.
    const seasonDelta = a.season !== null && b.season !== null ? a.season - b.season : 0;
    return seasonDelta || a.episode - b.episode;
  }
  if (a.unit === "none" && b.unit === "none") return 0;
  throw new PositionUnitMismatchError(a.unit, b.unit);
}

/** True when `incoming` moves the stored position forward; re-reads never move it back. */
export function shouldAdvance(current: Position | null, incoming: Position): boolean {
  if (current === null) return true; // unknown position: any information is better
  return comparePositions(incoming, current) > 0;
}
