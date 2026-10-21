import {
  detectChapterFromUrl,
  nextChapterUrl,
  normalizeDomain,
  parseHttpUrl,
  parseRuleFields,
  RULE_FIELDS,
  type RuleField,
  type RuleFields,
  type UrlDetection,
} from "@rwt/core";

export { RULE_FIELDS, type RuleField, type RuleFields };

const MAX_SAMPLES = 20;

/**
 * The test URLs for the editor, with the page the extension's "Regel bearbeiten" link came from
 * first (`?url=`). Only an http(s) URL on one of the site's domains is taken.
 */
export function withSampleUrl(sampleUrls: string[], raw: unknown, domains: string[]): string[] {
  const url = typeof raw === "string" ? parseHttpUrl(raw) : null;
  if (!url || !domains.includes(normalizeDomain(url.hostname))) return sampleUrls;
  return [url.href, ...sampleUrls.filter((sample) => sample !== url.href)];
}

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
  const parsed = parseRuleFields(fields, {
    sourceKey: site.sourceKey,
    domains: site.domains.length > 0 ? site.domains : ["example.org"],
  });
  const errors = parsed.ok ? {} : parsed.errors;
  const rule = parsed.ok ? parsed.rule : undefined;

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

  return { errors, usesRule: rule !== undefined && RULE_FIELDS.some((field) => rule[field] !== undefined), results };
}
