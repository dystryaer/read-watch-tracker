import { randomUUID } from "node:crypto";
import type { ProgressEvent } from "@rwt/core";
import { normalizeTitle } from "@rwt/core";
import { type Db, sourceDomains, sources, workLinks, works } from "@rwt/db";

type SourceInsert = typeof sources.$inferInsert;
type WorkInsert = typeof works.$inferInsert;

export async function seedSource(db: Db, values: Partial<SourceInsert> & { key: string }, domains: string[] = []) {
  const [source] = await db
    .insert(sources)
    .values({ name: values.key, kind: "website", trackingEnabled: true, ...values })
    .returning();
  if (!source) throw new Error("seedSource failed");
  if (domains.length > 0) {
    await db.insert(sourceDomains).values(
      domains.map((domain, index) => ({ domain, sourceId: source.id, isCurrent: index === domains.length - 1 })),
    );
  }
  return source;
}

export async function seedWork(db: Db, values: Partial<WorkInsert> & { title: string }) {
  const [work] = await db
    .insert(works)
    .values({ type: "manhwa", titleNormalized: normalizeTitle(values.title), ...values })
    .returning();
  if (!work) throw new Error("seedWork failed");
  return work;
}

export async function seedLink(
  db: Db,
  values: { workId: string; sourceId: string; externalKey: string; externalTitle: string; seriesUrl?: string },
) {
  const [link] = await db
    .insert(workLinks)
    .values({ ...values, externalTitleNormalized: normalizeTitle(values.externalTitle) })
    .returning();
  if (!link) throw new Error("seedLink failed");
  return link;
}

export function chapterEvent(
  overrides: Partial<Omit<ProgressEvent, "source" | "position">> & {
    source?: Partial<ProgressEvent["source"]>;
    chapter?: number;
    position?: ProgressEvent["position"];
  } = {},
): ProgressEvent {
  const { source, chapter = 345, position, ...rest } = overrides;
  return {
    id: randomUUID(),
    occurredAt: "2026-10-21T18:00:00.000Z",
    kind: "read",
    source: {
      key: "site:asura",
      externalKey: "overgeared",
      rawTitle: "Overgeared",
      url: `https://asuracomic.net/series/overgeared/chapter/${chapter}`,
      ...source,
    },
    position: position ?? { unit: "chapter", chapter },
    ...rest,
  };
}
