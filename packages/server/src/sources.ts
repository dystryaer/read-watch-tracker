import { DEFAULT_THRESHOLDS, type DeviceConfig, type EnableSourceResponse, isServiceHost, normalizeDomain, SiteRule } from "@rwt/core";
import { type Db, sourceDomains, sources } from "@rwt/db";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { storedRuleFields } from "./rule-columns";

type Source = typeof sources.$inferSelect;

export class SourceNotFoundError extends Error {
  constructor() {
    super("Source not found");
    this.name = "SourceNotFoundError";
  }
}

export class SourceConflictError extends Error {
  constructor() {
    super("Domain already belongs to another source");
    this.name = "SourceConflictError";
  }
}

/** Streaming services and apps keep their own fixed sources; their domains never become websites. */
export class ServiceDomainError extends Error {
  constructor() {
    super("Domain belongs to a streaming service or app");
    this.name = "ServiceDomainError";
  }
}

/**
 * "Diese Seite tracken" from the extension popup (SPEC §7.2): a new source, an existing one for a
 * known domain, or a domain move that keeps all links of the existing source.
 */
export async function enableSource(
  db: Db,
  input: { origin: string; name?: string; moveFromSourceKey?: string },
): Promise<EnableSourceResponse> {
  const domain = normalizeDomain(new URL(input.origin).hostname);
  // Otherwise a website source would capture the service's events (resolved by domain first).
  if (isServiceHost(domain)) throw new ServiceDomainError();
  return db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ source: sources })
      .from(sourceDomains)
      .innerJoin(sources, eq(sources.id, sourceDomains.sourceId))
      .where(eq(sourceDomains.domain, domain));

    if (input.moveFromSourceKey) {
      const [target] = await tx.select().from(sources).where(eq(sources.key, input.moveFromSourceKey));
      if (!target) throw new SourceNotFoundError();
      if (owner && owner.source.id !== target.id) throw new SourceConflictError();
      await tx.update(sourceDomains).set({ isCurrent: false }).where(eq(sourceDomains.sourceId, target.id));
      if (owner) {
        await tx.update(sourceDomains).set({ isCurrent: true }).where(eq(sourceDomains.domain, domain));
      } else {
        await tx.insert(sourceDomains).values({ domain, sourceId: target.id, isCurrent: true });
      }
      await tx.update(sources).set({ trackingEnabled: true }).where(eq(sources.id, target.id));
      return describeSource(tx, target);
    }

    if (owner) {
      await tx.update(sources).set({ trackingEnabled: true }).where(eq(sources.id, owner.source.id));
      return describeSource(tx, owner.source);
    }

    const key = await unusedKey(tx, `site:${domain.replaceAll(".", "-")}`.slice(0, 90));
    const [created] = await tx
      .insert(sources)
      .values({ key, name: input.name ?? domain, kind: "website", trackingEnabled: true })
      .returning();
    if (!created) throw new Error("Source could not be created");
    await tx.insert(sourceDomains).values({ domain, sourceId: created.id, isCurrent: true });
    return describeSource(tx, created);
  });
}

async function unusedKey(db: Db, base: string): Promise<string> {
  const taken = new Set(
    (await db.select({ key: sources.key }).from(sources).where(like(sources.key, `${base}%`))).map((row) => row.key),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix++) {
    if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  }
}

async function describeSource(db: Db, source: Source): Promise<EnableSourceResponse> {
  const domains = await db
    .select({ domain: sourceDomains.domain })
    .from(sourceDomains)
    .where(eq(sourceDomains.sourceId, source.id))
    .orderBy(asc(sourceDomains.addedAt), asc(sourceDomains.domain));
  return { sourceKey: source.key, name: source.name, domains: domains.map((row) => row.domain) };
}

/** Configuration for extension and Shield (SPEC §6.1 `/config`): enabled sites with their rules. */
export async function buildDeviceConfig(db: Db): Promise<DeviceConfig> {
  const enabled = await db
    .select()
    .from(sources)
    .where(and(eq(sources.kind, "website"), eq(sources.trackingEnabled, true)))
    .orderBy(asc(sources.key));
  if (enabled.length === 0) return { sites: [], thresholds: DEFAULT_THRESHOLDS };

  const domainRows = await db
    .select()
    .from(sourceDomains)
    .where(
      inArray(
        sourceDomains.sourceId,
        enabled.map((source) => source.id),
      ),
    )
    .orderBy(asc(sourceDomains.addedAt), asc(sourceDomains.domain));

  const sites: SiteRule[] = [];
  for (const source of enabled) {
    const candidate = {
      sourceKey: source.key,
      domains: domainRows.filter((row) => row.sourceId === source.id).map((row) => row.domain),
      ...storedRuleFields(source),
    };
    // Rules are validated when saved; re-checking here keeps one bad row from breaking every device.
    const rule = SiteRule.safeParse(candidate);
    if (rule.success) sites.push(rule.data);
  }
  return { sites, thresholds: DEFAULT_THRESHOLDS };
}
