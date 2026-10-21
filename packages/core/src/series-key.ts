import { MAX_TEXT_LENGTH } from "./event";
import { normalizeTitle } from "./normalize";

// Redesigns often append a random hex id ("overgeared-7d3f2a1b"). Only mixed digit/letter
// runs count: pure digits are usually stable ids, pure hex letters usually words ("facade").
const RANDOM_HASH_SUFFIX = /-(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{6,32}$/;

/** Stable series key from a URL slug or title; equal for the same series across URL redesigns. */
export function normalizeSeriesKey(raw: string): string {
  const words = normalizeTitle(safeDecode(raw).replace(/[-_]+/g, " "));
  return words
    .replaceAll(" ", "-")
    .replace(RANDOM_HASH_SUFFIX, "")
    .slice(0, MAX_TEXT_LENGTH)
    .replace(/^-+|-+$/g, "");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
