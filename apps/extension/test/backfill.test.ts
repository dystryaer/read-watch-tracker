import type { DeviceConfig } from "@rwt/core";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { backfillEventId, collectBackfill } from "../src/lib/backfill";

const config: DeviceConfig = {
  sites: [
    { sourceKey: "site:asura", domains: ["asuracomic.net", "asurascans.com"] },
    { sourceKey: "site:reader", domains: ["reader.example"], chapterPattern: String.raw`/read/[^/]+/(\d+)`, seriesPattern: String.raw`/read/([^/]+)/` },
  ],
  thresholds: { scrollDepthPercent: 60, watchedPercent: 85 },
};

describe("collectBackfill", () => {
  it("keeps the highest chapter per series of enabled sites, including old domains", () => {
    const entries = collectBackfill(
      [
        { url: "https://asuracomic.net/series/overgeared/chapter/340", title: "Overgeared Chapter 340", lastVisitTime: 1 },
        { url: "https://asurascans.com/series/overgeared/chapter/345", title: "Overgeared Chapter 345", lastVisitTime: 2 },
        { url: "https://asurascans.com/series/overgeared/chapter/344", title: "Overgeared Chapter 344", lastVisitTime: 3 },
        { url: "https://reader.example/read/solo-leveling/200", title: "Solo Leveling 200", lastVisitTime: 4 },
      ],
      config,
    );

    expect(entries.map((e) => [e.sourceKey, e.detection.seriesKey, e.detection.chapter])).toEqual([
      ["site:asura", "overgeared", 345],
      ["site:reader", "solo-leveling", 200],
    ]);
    expect(entries[0]).toMatchObject({ url: "https://asurascans.com/series/overgeared/chapter/345", visitedAt: 2 });
  });

  it("skips sites that are not enabled, non-chapter pages and entries without URL", () => {
    expect(
      collectBackfill(
        [
          { url: "https://other.example/manga/x/chapter-3", title: "X Chapter 3" },
          { url: "https://asuracomic.net/series/overgeared", title: "Overgeared" },
          { title: "no url" },
          { url: "javascript:alert(1)" },
        ],
        config,
      ),
    ).toEqual([]);
  });

  it("caps the result at 2000 series", () => {
    const items = Array.from({ length: 2500 }, (_, i) => ({ url: `https://asuracomic.net/series/s${i}/chapter/1` }));
    expect(collectBackfill(items, config)).toHaveLength(2000);
  });
});

describe("backfillEventId", () => {
  it("is a valid UUID and the same for the same series and chapter", async () => {
    const a = await backfillEventId("site:asura", "overgeared", 345);
    expect(z.uuid().safeParse(a).success).toBe(true);
    expect(await backfillEventId("site:asura", "overgeared", 345)).toBe(a);
    expect(await backfillEventId("site:asura", "overgeared", 346)).not.toBe(a);
    // Pinned: ids of backfills already sent must stay the same across refactorings.
    expect(a).toBe("b1c89809-7523-8afe-a247-d37a656a48da");
  });
});
