import { detectChapterFromUrl, nextChapterUrl, SiteRule, type UrlDetection } from "@rwt/core";

export type RuleField = "chapterPattern" | "seriesPattern" | "titleSelector" | "endSelector" | "nextUrlTemplate";
export type RuleFields = Partial<Record<RuleField, string>>;

export const RULE_FIELDS: readonly RuleField[] = [
  "chapterPattern",
  "seriesPattern",
  "titleSelector",
  "endSelector",
  "nextUrlTemplate",
];

const MAX_SAMPLES = 20;

export interface RuleEvaluation {
  errors: Partial<Record<RuleField, string>>;
  /** False while the rule is empty or invalid: the samples then show the generic detection. */
  usesRule: boolean;
  results: { url: string; detection: UrlDetection | null; next: string | null }[];
}

/**
 * Live test of the rule editor (SPEC §7.3): the same core code as the extension, so what the
 * editor shows is what the extension will detect. Each line is "URL" or "URL | page title".
 */
export function evaluateRule(
  fields: RuleFields,
  site: { sourceKey: string; domains: string[] },
  samples: string,
): RuleEvaluation {
  const filled = Object.fromEntries(
    RULE_FIELDS.flatMap((field) => {
      const value = fields[field]?.trim();
      return value ? [[field, value]] : [];
    }),
  );
  const parsed = SiteRule.safeParse({
    sourceKey: site.sourceKey,
    domains: site.domains.length > 0 ? site.domains : ["example.org"],
    ...filled,
  });

  const errors: RuleEvaluation["errors"] = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = RULE_FIELDS.find((name) => name === issue.path[0]);
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }
  const rule = parsed.success ? parsed.data : undefined;

  const results = samples
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, MAX_SAMPLES)
    .map((line) => {
      const [url = "", ...title] = line.split(" | ");
      const detection = detectChapterFromUrl(url, title.join(" | "), rule);
      const next = detection
        ? nextChapterUrl({ lastUrl: url, chapter: detection.chapter, seriesUrl: detection.seriesUrl, template: rule?.nextUrlTemplate })
        : null;
      return { url, detection, next: next?.kind === "next" ? next.href : null };
    });

  return { errors, usesRule: rule !== undefined && Object.keys(filled).length > 0, results };
}
