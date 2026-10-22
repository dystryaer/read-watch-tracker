import { describe, expect, it } from "vitest";
import { headContinueLink } from "../src/lib/work-head";

const asura = { nextUrlTemplate: null, currentDomain: "asuracomic.net", seriesUrl: "https://asuracomic.net/series/eleceed" };

describe("headContinueLink: the big button on the detail page", () => {
  it("names the chapter it opens", () => {
    expect(
      headContinueLink({ type: "manhwa", chapter: 421, lastUrl: "https://asuracomic.net/series/eleceed/chapter/421" }, asura),
    ).toEqual({ href: "https://asuracomic.net/series/eleceed/chapter/422", label: "Weiterlesen · Kap. 422" });
  });

  it("steps from a decimal chapter to the next whole one", () => {
    expect(
      headContinueLink({ type: "manhwa", chapter: 105.5, lastUrl: "https://asuracomic.net/series/eleceed/chapter/105.5" }, asura)?.label,
    ).toBe("Weiterlesen · Kap. 106");
  });

  it("uses the source's template and current domain", () => {
    const moved = { nextUrlTemplate: "{seriesUrl}/ch-{next}", currentDomain: "asuracomic.net", seriesUrl: "https://asura.gg/series/eleceed" };
    expect(headContinueLink({ type: "manhwa", chapter: 7, lastUrl: null }, moved)).toEqual({
      href: "https://asuracomic.net/series/eleceed/ch-8",
      label: "Weiterlesen · Kap. 8",
    });
  });

  it("reopens the last chapter when the next one cannot be derived", () => {
    expect(headContinueLink({ type: "manhwa", chapter: 421, lastUrl: "https://asuracomic.net/series/eleceed/reader" }, asura)).toEqual({
      href: "https://asuracomic.net/series/eleceed/reader",
      label: "Zuletzt gelesen · Kap. 421",
    });
    expect(headContinueLink({ type: "ebook", chapter: null, lastUrl: "https://read.amazon.com/?asin=B08FHBV4ZX" }, null)).toEqual({
      href: "https://read.amazon.com/?asin=B08FHBV4ZX",
      label: "Zuletzt gelesen",
    });
  });

  it("opens the series page for series, anime and films", () => {
    const crunchyroll = { nextUrlTemplate: null, currentDomain: null, seriesUrl: "https://www.crunchyroll.com/series/GG5H5XQX4" };
    expect(headContinueLink({ type: "anime", chapter: null, lastUrl: null }, crunchyroll)).toEqual({
      href: "https://www.crunchyroll.com/series/GG5H5XQX4",
      label: "Öffnen",
    });
    expect(headContinueLink({ type: "movie", chapter: null, lastUrl: "https://www.netflix.com/watch/1" }, null)?.label).toBe("Öffnen");
  });

  it("has no button without a usable address", () => {
    expect(headContinueLink({ type: "manhwa", chapter: 3, lastUrl: null }, null)).toBeNull();
    expect(headContinueLink({ type: "anime", chapter: null, lastUrl: "javascript:alert(1)" }, null)).toBeNull();
  });
});
