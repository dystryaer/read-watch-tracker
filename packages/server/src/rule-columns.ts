import type { RuleFields } from "@rwt/core";
import type { sources } from "@rwt/db";

type RuleColumns = Pick<
  typeof sources.$inferSelect,
  | "ruleChapterPattern"
  | "ruleSeriesPattern"
  | "ruleTitleSelector"
  | "ruleEndSelector"
  | "ruleNextUrlTemplate"
  | "ruleSeriesUrlTemplate"
  | "ruleChapterLinkPattern"
>;

/** The rule fields stored on a source row; unset columns are left out. */
export function storedRuleFields(source: RuleColumns): RuleFields {
  return {
    ...(source.ruleChapterPattern ? { chapterPattern: source.ruleChapterPattern } : {}),
    ...(source.ruleSeriesPattern ? { seriesPattern: source.ruleSeriesPattern } : {}),
    ...(source.ruleTitleSelector ? { titleSelector: source.ruleTitleSelector } : {}),
    ...(source.ruleEndSelector ? { endSelector: source.ruleEndSelector } : {}),
    ...(source.ruleNextUrlTemplate ? { nextUrlTemplate: source.ruleNextUrlTemplate } : {}),
    ...(source.ruleSeriesUrlTemplate ? { seriesUrlTemplate: source.ruleSeriesUrlTemplate } : {}),
    ...(source.ruleChapterLinkPattern ? { chapterLinkPattern: source.ruleChapterLinkPattern } : {}),
  };
}

/** Column values for saving a rule; a missing field clears its column. */
export function ruleColumns(fields: RuleFields): RuleColumns {
  return {
    ruleChapterPattern: fields.chapterPattern ?? null,
    ruleSeriesPattern: fields.seriesPattern ?? null,
    ruleTitleSelector: fields.titleSelector ?? null,
    ruleEndSelector: fields.endSelector ?? null,
    ruleNextUrlTemplate: fields.nextUrlTemplate ?? null,
    ruleSeriesUrlTemplate: fields.seriesUrlTemplate ?? null,
    ruleChapterLinkPattern: fields.chapterLinkPattern ?? null,
  };
}
