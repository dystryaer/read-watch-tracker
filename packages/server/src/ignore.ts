import { type Db, events, pendingMatches, sources, workLinks } from "@rwt/db";
import { and, eq, isNull } from "drizzle-orm";
import { SourceNotFoundError } from "./sources";

/**
 * "Falsch erkannt? Serie ignorieren" from the extension popup (SPEC §7.8): the key is detached
 * from any work, its waiting events are dropped and future events are ignored.
 */
export async function ignoreSeries(
  db: Db,
  input: { sourceKey: string; externalKey: string; rawTitle: string },
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [source] = await tx.select().from(sources).where(eq(sources.key, input.sourceKey));
    if (!source) throw new SourceNotFoundError();
    const sameKey = (table: typeof workLinks | typeof pendingMatches) =>
      and(eq(table.sourceId, source.id), eq(table.externalKey, input.externalKey));

    await tx.delete(workLinks).where(sameKey(workLinks));
    await tx
      .update(events)
      .set({ outcome: "ignored" })
      .where(and(eq(events.sourceId, source.id), eq(events.externalKey, input.externalKey), eq(events.outcome, "pending")));

    const [ignored] = await tx
      .select({ id: pendingMatches.id })
      .from(pendingMatches)
      .where(and(sameKey(pendingMatches), eq(pendingMatches.resolution, "ignored")));
    if (ignored) return;

    const resolved = await tx
      .update(pendingMatches)
      .set({ resolvedAt: now, resolution: "ignored" })
      .where(and(sameKey(pendingMatches), isNull(pendingMatches.resolvedAt)))
      .returning({ id: pendingMatches.id });
    if (resolved.length === 0) {
      await tx.insert(pendingMatches).values({
        sourceId: source.id,
        externalKey: input.externalKey,
        rawTitle: input.rawTitle,
        firstSeenAt: now,
        lastSeenAt: now,
        resolvedAt: now,
        resolution: "ignored",
      });
    }
  });
}
