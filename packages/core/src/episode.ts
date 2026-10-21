import { normalizeTitle } from "./normalize";

export interface EpisodeInfo {
  /** Null when the label names no season (e.g. "Folge 5"); progress then compares episodes only. */
  season: number | null;
  episode: number;
}

const MAX_LABEL_LENGTH = 500;
const MAX_SEASON = 999;
const MAX_EPISODE = 99999;

// Season and episode together: "S2 E5", "S02E05", "S2:E5", "Staffel 2, Folge 5", "Season 2 Ep. 5", "1x05".
const SEASON_AND_EPISODE = [
  /(?<![\p{L}\d])s(\d{1,4})\s*[:.]?\s*e(\d{1,6})(?!\d)/iu,
  /(?<![\p{L}\d])(?:season|staffel)\s*(\d{1,4})\s*[,·:–—-]?\s*(?:episode|folge|ep\.?)\s*(\d{1,6})(?!\d)/iu,
  /(?<![\p{L}\d])(\d{1,3})x(\d{1,4})(?!\d)/u,
];
// Episode alone: a bare "E5" only at the start, so "Live E3 2024" is not episode 3.
const EPISODE_ONLY = [/^\s*e(\d{1,6})(?!\d)/i, /(?<![\p{L}\d])(?:episode|folge|ep\.?)\s*(\d{1,6})(?!\d)/iu];

/**
 * Season and episode from a player or history label (SPEC §7.5, §8.3). The first pattern that
 * matches decides; a number out of range (season 0 specials, episode 0) means "no episode".
 */
export function parseEpisode(label: string): EpisodeInfo | null {
  if (label.length > MAX_LABEL_LENGTH) return null;

  for (const pattern of SEASON_AND_EPISODE) {
    const match = pattern.exec(label);
    if (match) return checked(Number(match[1]), Number(match[2]));
  }
  for (const pattern of EPISODE_ONLY) {
    const match = pattern.exec(label);
    if (match) return checked(null, Number(match[1]));
  }
  return null;
}

function checked(season: number | null, episode: number): EpisodeInfo | null {
  if (season !== null && (season < 1 || season > MAX_SEASON)) return null;
  if (episode < 1 || episode > MAX_EPISODE) return null;
  return { season, episode };
}

// Language and version tags of streaming titles: "(German Dub)", "[Sub]", "(OmU)", "(Uncut)", "- Dub".
const STREAMING_TAG =
  /\s*(?:[([]\s*(?:(?:german|english|japanese|deutsch|deutsche|englisch|japanisch)\s+)?(?:dub|dubbed|sub|subs|subbed|omu|audio|uncut)\s*[)\]]|[-–—:]\s*(?:(?:german|english|deutsch)\s+)?(?:dub|dubbed|sub|subbed))\s*$/iu;

/**
 * `externalKey` of a streaming series (SPEC §5.2): the normalized title without dub/sub tags, so
 * the German dub on the desktop and the original on the Shield land on the same work. Idempotent.
 */
export function streamingSeriesKey(title: string): string {
  let current = title.slice(0, MAX_LABEL_LENGTH);
  for (;;) {
    const stripped = current.replace(STREAMING_TAG, "");
    // A title made only of a tag keeps it rather than becoming empty.
    if (stripped === current || stripped.trim() === "") break;
    current = stripped;
  }
  return normalizeTitle(current);
}
