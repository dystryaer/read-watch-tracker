import { type DbHandle, sources, workCovers, workLinks } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CoverImageError, fillSiteCovers, getCoverImage, removeCover, resetCover, setCoverImage } from "../src/covers";
import type { DownloadResult } from "../src/http/image-download";
import { WorkNotFoundError } from "../src/manual";
import { mergeWorks } from "../src/work-detail";
import { seedLink, seedSource, seedWork } from "./helpers";

let handle: DbHandle;
const NOW = new Date("2026-10-22T08:00:00.000Z");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const COVER_URL = "https://cdn.example/thumbnails/solo-leveling.webp";

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle?.close();
});
beforeEach(async () => {
  await resetDb(handle.db);
});

const found = (bytes = WEBP): DownloadResult => ({ ok: true, mime: "image/webp", bytes });
const downloads = (result: DownloadResult = found()) => vi.fn(async () => result);

async function coverRow(workId: string) {
  const [row] = await handle.db.select().from(workCovers).where(eq(workCovers.workId, workId));
  return row;
}

/** A work read on a site whose page named `coverUrl` as its preview image. */
async function workWithSiteCover(title = "Solo Leveling", coverUrl: string | null = COVER_URL) {
  const [existing] = await handle.db.select().from(sources).limit(1);
  const source = existing ?? (await seedSource(handle.db, { key: "site:demonic" }, ["demonicscans.org"]));
  const work = await seedWork(handle.db, { title });
  const link = await seedLink(handle.db, { workId: work.id, sourceId: source.id, externalKey: title.toLowerCase(), externalTitle: title });
  await handle.db.update(workLinks).set({ coverUrl }).where(eq(workLinks.id, link.id));
  return work;
}

describe("setCoverImage", () => {
  it("stores a picture added by hand with the type from its bytes", async () => {
    const work = await seedWork(handle.db, { title: "Overgeared" });

    await setCoverImage(handle.db, work.id, PNG, { now: NOW });

    expect(await getCoverImage(handle.db, work.id)).toEqual({ mime: "image/png", image: PNG, updatedAt: NOW });
    expect((await coverRow(work.id))?.kind).toBe("upload");
  });

  it("refuses what is not a picture, and pictures above 1 MB", async () => {
    const work = await seedWork(handle.db, { title: "Overgeared" });
    const svg = new TextEncoder().encode("<svg onload=alert(1)>");
    const huge = new Uint8Array(1_000_001);
    huge.set(PNG);

    await expect(setCoverImage(handle.db, work.id, svg)).rejects.toThrow(CoverImageError);
    await expect(setCoverImage(handle.db, work.id, huge)).rejects.toThrow(CoverImageError);
    expect(await coverRow(work.id)).toBeUndefined();
  });

  it("reports a work that does not exist", async () => {
    await expect(setCoverImage(handle.db, "00000000-0000-4000-8000-000000000000", PNG)).rejects.toThrow(WorkNotFoundError);
  });
});

describe("removeCover and resetCover", () => {
  it("removing keeps the site picture from coming back; resetting lets it come again", async () => {
    const work = await workWithSiteCover();
    const download = downloads();
    await setCoverImage(handle.db, work.id, PNG);

    await removeCover(handle.db, work.id);
    expect(await getCoverImage(handle.db, work.id)).toBeNull();
    expect(await fillSiteCovers(handle.db, download)).toBe(0);
    expect(download).not.toHaveBeenCalled();

    await resetCover(handle.db, work.id);
    expect(await fillSiteCovers(handle.db, download)).toBe(1);
    expect((await getCoverImage(handle.db, work.id))?.mime).toBe("image/webp");
  });
});

describe("fillSiteCovers", () => {
  it("downloads the site picture of works without a cover", async () => {
    const work = await workWithSiteCover();
    const download = downloads();

    expect(await fillSiteCovers(handle.db, download, { now: NOW })).toBe(1);

    expect(download).toHaveBeenCalledWith(COVER_URL);
    expect(await coverRow(work.id)).toMatchObject({ kind: "site", mime: "image/webp", sourceUrl: COVER_URL });
  });

  it("never replaces a picture added by hand", async () => {
    const work = await workWithSiteCover();
    await setCoverImage(handle.db, work.id, PNG);
    const download = downloads();

    expect(await fillSiteCovers(handle.db, download)).toBe(0);
    expect(download).not.toHaveBeenCalled();
    expect((await coverRow(work.id))?.kind).toBe("upload");
  });

  it("remembers a failed picture and tries again only after a week or with a new address", async () => {
    const work = await workWithSiteCover();
    const failing = downloads({ ok: false, reason: "status" });

    await fillSiteCovers(handle.db, failing, { now: NOW });
    await fillSiteCovers(handle.db, failing, { now: new Date(NOW.getTime() + 24 * 3600_000) });
    expect(failing).toHaveBeenCalledTimes(1);
    expect((await coverRow(work.id))?.kind).toBe("unusable");

    const working = downloads();
    expect(await fillSiteCovers(handle.db, working, { now: new Date(NOW.getTime() + 8 * 24 * 3600_000) })).toBe(1);
    expect((await coverRow(work.id))?.kind).toBe("site");
  });

  it("tries a new address right away", async () => {
    const work = await workWithSiteCover();
    await fillSiteCovers(handle.db, downloads({ ok: false, reason: "not_image" }), { now: NOW });
    await handle.db.update(workLinks).set({ coverUrl: "https://cdn.example/other.webp" }).where(eq(workLinks.workId, work.id));

    const working = downloads();
    expect(await fillSiteCovers(handle.db, working, { now: NOW })).toBe(1);
    expect(working).toHaveBeenCalledWith("https://cdn.example/other.webp");
  });

  it("treats one picture named by several series as the site's logo, not a cover", async () => {
    const logo = "https://demonicscans.org/logo.png";
    const first = await workWithSiteCover("Solo Leveling", logo);
    await fillSiteCovers(handle.db, downloads(), { now: NOW });
    expect((await coverRow(first.id))?.kind).toBe("site");

    const second = await workWithSiteCover("Overgeared", logo);
    const download = downloads();
    await fillSiteCovers(handle.db, download, { now: NOW });

    expect(download).not.toHaveBeenCalled();
    expect((await coverRow(first.id))?.kind).toBe("unusable");
    expect((await coverRow(second.id))?.kind).toBe("unusable");
    expect(await getCoverImage(handle.db, first.id)).toBeNull();
  });

  it("can bring the picture of one work only", async () => {
    await workWithSiteCover("A", "https://cdn.example/A.webp");
    const wanted = await workWithSiteCover("B", "https://cdn.example/B.webp");
    const download = downloads();

    expect(await fillSiteCovers(handle.db, download, { workId: wanted.id })).toBe(1);
    expect(download).toHaveBeenCalledWith("https://cdn.example/B.webp");
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("works through at most `limit` works per run", async () => {
    for (const title of ["A", "B", "C"]) await workWithSiteCover(title, `https://cdn.example/${title}.webp`);
    const download = downloads();

    expect(await fillSiteCovers(handle.db, download, { limit: 2 })).toBe(2);
    expect(await fillSiteCovers(handle.db, download, { limit: 2 })).toBe(1);
  });
});

describe("mergeWorks and covers", () => {
  it("keeps the duplicate's picture when the remaining work has none", async () => {
    const duplicate = await seedWork(handle.db, { title: "Solo Leveling (2)" });
    const kept = await seedWork(handle.db, { title: "Solo Leveling" });
    await setCoverImage(handle.db, duplicate.id, PNG);

    await mergeWorks(handle.db, duplicate.id, kept.id);

    expect((await getCoverImage(handle.db, kept.id))?.image).toEqual(PNG);
  });

  it("keeps the remaining work's own picture", async () => {
    const duplicate = await seedWork(handle.db, { title: "Solo Leveling (2)" });
    const kept = await seedWork(handle.db, { title: "Solo Leveling" });
    await setCoverImage(handle.db, duplicate.id, PNG);
    await setCoverImage(handle.db, kept.id, WEBP);

    await mergeWorks(handle.db, duplicate.id, kept.id);

    expect((await getCoverImage(handle.db, kept.id))?.image).toEqual(WEBP);
  });
});
