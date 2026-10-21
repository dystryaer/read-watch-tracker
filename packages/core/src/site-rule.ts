import { z } from "zod";
import { SourceKey } from "./event";

export const MAX_PATTERN_LENGTH = 200;
const MAX_SELECTOR_LENGTH = 200;
const MAX_TEMPLATE_LENGTH = 500;
const NEXT_URL_PLACEHOLDERS = new Set(["origin", "seriesUrl", "series", "next"]);

// A quantified group that itself contains a quantifier, e.g. (\d+)+ or (a*){2,}:
// the classic catastrophic-backtracking shape. A heuristic, not a full ReDoS proof.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/;

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function isHostname(value: string): boolean {
  return HOSTNAME.test(value);
}

/** Rule patterns run case-insensitively on the URL path; invalid patterns yield null. */
export function compileRulePattern(pattern: string, flags = "i"): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function captureGroupCount(pattern: string): number {
  // An empty alternative makes the regex match "" and exposes every group in the result.
  const match = compileRulePattern(`${pattern}|`)?.exec("");
  return match ? match.length - 1 : 0;
}

const Hostname = z.string().trim().toLowerCase().regex(HOSTNAME, "nur der Host-Name, z. B. asurascans.com");

const Pattern = z
  .string()
  .min(1)
  .max(MAX_PATTERN_LENGTH)
  .refine((pattern) => compileRulePattern(pattern) !== null, "kein gültiger regulärer Ausdruck")
  .refine((pattern) => captureGroupCount(pattern) >= 1, "braucht eine Gruppe ( … ) für den Wert")
  .refine((pattern) => !NESTED_QUANTIFIER.test(pattern), "verschachtelte Wiederholungen wie (a+)+ sind nicht erlaubt");

const Selector = z.string().trim().min(1).max(MAX_SELECTOR_LENGTH);

const NextUrlTemplate = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TEMPLATE_LENGTH)
  .refine(
    (template) => /^(?:\{origin\}|\{seriesUrl\}|https?:\/\/)/.test(template),
    "muss mit {origin}, {seriesUrl} oder http(s):// beginnen",
  )
  .refine(
    (template) =>
      [...template.matchAll(/\{([^}]*)\}/g)].every((m) => NEXT_URL_PLACEHOLDERS.has(m[1] ?? "")),
    "unbekannter Platzhalter (erlaubt: {origin}, {seriesUrl}, {series}, {next})",
  )
  .refine((template) => template.includes("{next}"), "muss {next} enthalten");

export const SiteRule = z.object({
  sourceKey: SourceKey,
  domains: z.array(Hostname).min(1).max(20),
  chapterPattern: Pattern.optional(),
  seriesPattern: Pattern.optional(),
  titleSelector: Selector.optional(),
  endSelector: Selector.optional(),
  nextUrlTemplate: NextUrlTemplate.optional(),
});
export type SiteRule = z.infer<typeof SiteRule>;
