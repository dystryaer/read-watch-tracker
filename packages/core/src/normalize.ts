// Tags that sites append to a title without changing which work it is.
const NOISE_TAGS = [
  "manga",
  "manhwa",
  "manhua",
  "webtoon",
  "official",
  "remastered",
  "german dub",
  "english dub",
  "dub",
];

const TRAILING_NOISE_TAG = new RegExp(
  String.raw`\s*[(\[]\s*(?:${NOISE_TAGS.map((tag) => tag.replaceAll(" ", String.raw`\s+`)).join("|")})\s*[)\]]\s*$`,
  "u",
);

// Removed before NFKD, which would decompose ´ into a space plus a combining accent.
const APOSTROPHES = /['’‘´`ʼ＇]/g;
// Only the Latin combining block: stripping all marks would turn Japanese が into か.
const LATIN_DIACRITICS = /[\u0300-\u036f]/g;
const INVISIBLE_FORMAT_CHARS = /\p{Cf}/gu;
const DIGIT_GROUP_SEPARATOR = /(?<=\d)[.,](?=\d)/g;
// Marks stay because scripts such as Devanagari need them; Latin ones are already gone.
const NON_WORD_CHARS = /[^\p{L}\p{M}\p{N}]+/gu;

/**
 * Reduces a title to a comparison key, so that the same work matches across
 * sites that differ in apostrophes, dashes, width, diacritics or tags like "(Manhwa)".
 * Idempotent.
 */
export function normalizeTitle(title: string): string {
  const folded = title
    .replace(APOSTROPHES, "") // swordmaster's → swordmasters, matching sites that drop it
    .normalize("NFKD")
    .replace(LATIN_DIACRITICS, "")
    .normalize("NFKC")
    .replace(INVISIBLE_FORMAT_CHARS, "")
    .toLowerCase();

  return stripTrailingNoiseTags(folded)
    .replace(DIGIT_GROUP_SEPARATOR, "") // 10,000 and 10.000 → 10000
    .replace(NON_WORD_CHARS, " ")
    .trim();
}

function stripTrailingNoiseTags(title: string): string {
  let current = title;
  for (;;) {
    const stripped = current.replace(TRAILING_NOISE_TAG, "");
    // A title made only of a tag, e.g. "(Manga)", keeps it rather than becoming empty.
    if (stripped === current || stripped.trim() === "") return current;
    current = stripped;
  }
}
