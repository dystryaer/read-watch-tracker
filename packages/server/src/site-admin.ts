import { isHostname, isServiceHost, normalizeDomain, parseRuleFields, type RuleFields } from "@rwt/core";
import { type Db, events, sourceDomains, sources, workLinks } from "@rwt/db";
import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { ruleColumns, storedRuleFields } from "./rule-columns";

export class SiteDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteDomainError";
  }
}

export type SiteRuleFields = RuleFields;

export interface SiteSummary {
  id: string;
  key: string;
  name: string;
  trackingEnabled: boolean;
  linkCount: number;
  domains: { domain: string; isCurrent: boolean }[];
  rule: SiteRuleFields;
  /** Why the devices skip this site's stored rule (e.g. after stricter checks), or null. */
  ruleProblem: string | null;
}

type SourceRow = typeof sources.$inferSelect;

async function summarize(db: Db, rows: SourceRow[]): Promise<SiteSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const domains = await db
    .select()
    .from(sourceDomains)
    .where(inArray(sourceDomains.sourceId, ids))
    .orderBy(asc(sourceDomains.addedAt), asc(sourceDomains.domain));
  const linkCounts = await db
    .select({ sourceId: workLinks.sourceId, links: count() })
    .from(workLinks)
    .where(inArray(workLinks.sourceId, ids))
    .groupBy(workLinks.sourceId);

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    trackingEnabled: row.trackingEnabled,
    linkCount: linkCounts.find((entry) => entry.sourceId === row.id)?.links ?? 0,
    domains: domains
      .filter((domain) => domain.sourceId === row.id)
      .map(({ domain, isCurrent }) => ({ domain, isCurrent })),
    rule: storedRuleFields(row),
    ruleProblem: ruleProblemOf(row),
  }));
}

function ruleProblemOf(row: SourceRow): string | null {
  const parsed = parseRuleFields(storedRuleFields(row));
  return parsed.ok ? null : (Object.values(parsed.errors)[0] ?? null);
}

/** Websites the extension can track (SPEC §7.2), for the settings page. */
export async function listSites(db: Db): Promise<SiteSummary[]> {
  const rows = await db.select().from(sources).where(eq(sources.kind, "website")).orderBy(asc(sources.name));
  return summarize(db, rows);
}

/** Id of a website source by key, in one query (for Server Actions that only need the id). */
export async function getSiteId(db: Db, key: string): Promise<string | null> {
  const [row] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.key, key), eq(sources.kind, "website")));
  return row?.id ?? null;
}

export async function getSite(db: Db, key: string): Promise<SiteSummary | null> {
  const rows = await db
    .select()
    .from(sources)
    .where(and(eq(sources.key, key), eq(sources.kind, "website")));
  return (await summarize(db, rows))[0] ?? null;
}

export type RuleUpdateResult = { ok: true } | { ok: false; errors: Partial<Record<keyof SiteRuleFields, string>> };

/** Saves the site rule (SPEC §7.3) after the same validation the devices apply; empty fields are cleared. */
export async function updateSiteRule(
  db: Db,
  sourceId: string,
  fields: SiteRuleFields,
  now = new Date(),
): Promise<RuleUpdateResult> {
  const parsed = parseRuleFields(fields);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  await db
    .update(sources)
    .set({ ...ruleColumns(parsed.rule), ruleUpdatedAt: now })
    .where(eq(sources.id, sourceId));
  return { ok: true };
}

export async function setSiteTracking(db: Db, sourceId: string, enabled: boolean): Promise<void> {
  await db.update(sources).set({ trackingEnabled: enabled }).where(eq(sources.id, sourceId));
}

export async function renameSite(db: Db, sourceId: string, name: string): Promise<void> {
  await db.update(sources).set({ name }).where(eq(sources.id, sourceId));
}

/** Adds a domain in the web app; `makeCurrent` records a domain move (SPEC §7.2). */
export async function addSiteDomain(
  db: Db,
  sourceId: string,
  rawDomain: string,
  { makeCurrent }: { makeCurrent: boolean },
): Promise<void> {
  const domain = normalizeDomain(rawDomain.trim());
  if (!isHostname(domain)) throw new SiteDomainError("Bitte nur den Host-Namen angeben, z. B. asurascans.com");
  if (isServiceHost(domain)) throw new SiteDomainError("Diese Domain gehört zu einem Streaming-Dienst oder einer App");

  await db.transaction(async (tx) => {
    const [owner] = await tx.select().from(sourceDomains).where(eq(sourceDomains.domain, domain));
    if (owner && owner.sourceId !== sourceId) throw new SiteDomainError("Diese Domain gehört bereits zu einer anderen Seite");
    if (makeCurrent) await tx.update(sourceDomains).set({ isCurrent: false }).where(eq(sourceDomains.sourceId, sourceId));
    if (owner) {
      if (makeCurrent) await tx.update(sourceDomains).set({ isCurrent: true }).where(eq(sourceDomains.domain, domain));
    } else {
      await tx.insert(sourceDomains).values({ domain, sourceId, isCurrent: makeCurrent });
    }
  });
}

/** The latest distinct URLs seen on a site: ready-made examples for the rule editor's live test. */
export async function listRecentSiteUrls(db: Db, sourceId: string, limit = 5): Promise<string[]> {
  const rows = await db
    .select({ url: events.url })
    .from(events)
    .where(and(eq(events.sourceId, sourceId), isNotNull(events.url)))
    .orderBy(desc(events.occurredAt))
    .limit(limit * 10);
  return [...new Set(rows.flatMap((row) => (row.url ? [row.url] : [])))].slice(0, limit);
}
