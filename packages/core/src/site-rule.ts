import { z } from "zod";
import { SourceKey } from "./event";

export const MAX_PATTERN_LENGTH = 200;
const MAX_SELECTOR_LENGTH = 200;
const MAX_TEMPLATE_LENGTH = 500;
const NEXT_URL_PLACEHOLDERS = new Set(["origin", "seriesUrl", "series", "next"]);

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

/**
 * Rejects the shapes behind catastrophic backtracking instead of trying to recognize every
 * dangerous one: a repeated group – (\d+)+, (a|a)*, (x){3} – and backreferences. Groups may only
 * be made optional with "?". Escaped parentheses and character classes are skipped.
 */
function unsafeShape(pattern: string): "repeated_group" | "backreference" | null {
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\") {
      if (!inClass && /[1-9k]/.test(pattern[i + 1] ?? "")) return "backreference";
      i++;
    } else if (inClass) {
      if (char === "]") inClass = false;
    } else if (char === "[") {
      inClass = true;
    } else if (char === ")" && /[+*{]/.test(pattern[i + 1] ?? "")) {
      return "repeated_group";
    }
  }
  return null;
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
  .refine(
    (pattern) => unsafeShape(pattern) !== "repeated_group",
    "Gruppen dürfen nur mit ? optional sein, nicht wiederholt werden (wie (a+)+ oder (ab)*)",
  )
  .refine((pattern) => unsafeShape(pattern) !== "backreference", "Rückverweise wie \\1 sind nicht erlaubt");

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
  domains: z.array(Hostname).min(1).max(50),
  chapterPattern: Pattern.optional(),
  seriesPattern: Pattern.optional(),
  titleSelector: Selector.optional(),
  endSelector: Selector.optional(),
  nextUrlTemplate: NextUrlTemplate.optional(),
});
export type SiteRule = z.infer<typeof SiteRule>;

/** The fields of a site rule the user edits (SPEC §7.3). */
export const RULE_FIELDS = ["chapterPattern", "seriesPattern", "titleSelector", "endSelector", "nextUrlTemplate"] as const;
export type RuleField = (typeof RULE_FIELDS)[number];
export type RuleFields = Partial<Record<RuleField, string>>;

/**
 * Checks rule fields typed into the editor with the schema the devices apply. Blank fields are
 * dropped; errors are reported per field (first message only).
 */
export function parseRuleFields(
  fields: RuleFields,
  site: { sourceKey: string; domains: string[] } = { sourceKey: "site:validation", domains: ["validation.example"] },
): { ok: true; rule: SiteRule } | { ok: false; errors: Partial<Record<RuleField, string>> } {
  const filled = Object.fromEntries(
    RULE_FIELDS.flatMap((field) => {
      const value = fields[field]?.trim();
      return value ? [[field, value]] : [];
    }),
  );
  const parsed = SiteRule.safeParse({ ...site, ...filled });
  if (parsed.success) return { ok: true, rule: parsed.data };

  const errors: Partial<Record<RuleField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = RULE_FIELDS.find((name) => name === issue.path[0]);
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}
