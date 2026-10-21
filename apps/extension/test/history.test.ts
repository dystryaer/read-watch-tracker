// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { isHistoryPage, latestPerSeries, MAX_HISTORY_ENTRIES, readHistory } from "../src/streaming/history";

// Synthetic history pages (A10): unverified until samples of the real pages replace them.
function page(html: string) {
  document.body.innerHTML = html;
  return document;
}

const crunchyrollHistory = new URL("https://www.crunchyroll.com/history");

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("readHistory", () => {
  it("reads the Crunchyroll history, with the series link where a card has one", () => {
    const doc = page(`
      <div class="history-card"><a href="/series/G1/frieren"><h4>Frieren: Beyond Journey’s End</h4></a><h3>S1 E5 - Phantoms of the Dead</h3><span>vor 2 Tagen</span></div>
      <div class="history-card"><h4>Dandadan</h4><h3>E12 - Let's Go to the Cursed House</h3></div>`);
    expect(readHistory(doc, crunchyrollHistory)).toEqual([
      { seriesTitle: "Frieren: Beyond Journey’s End", season: 1, episode: 5, seriesUrl: "https://www.crunchyroll.com/series/G1/frieren" },
      { seriesTitle: "Dandadan", season: null, episode: 12, seriesUrl: null },
    ]);
  });

  it("reads the Prime Video watch history", () => {
    const doc = page(`<ul><li class="watch-history-item"><p>21. Oktober 2026</p><a>The Boys</a><span>Staffel 2, Folge 5</span></li></ul>`);
    expect(readHistory(doc, new URL("https://www.amazon.de/gp/video/settings/watch-history"))).toEqual([
      { seriesTitle: "The Boys", season: 2, episode: 5, seriesUrl: null },
    ]);
  });

  it("reads Netflix entries that name an episode, and skips those that only name its title", () => {
    const doc = page(`<ul>
      <li class="retableRow"><div class="col date">21.10.26</div><div class="col title"><a href="/title/80100172">Dark: Staffel 2: Folge 5</a></div></li>
      <li class="retableRow"><div class="col date">20.10.26</div><div class="col title"><a href="/title/80100172">Dark: Staffel 2: „Lügen“</a></div></li>
    </ul>`);
    expect(readHistory(doc, new URL("https://www.netflix.com/viewingactivity"))).toEqual([
      { seriesTitle: "Dark", season: 2, episode: 5, seriesUrl: "https://www.netflix.com/title/80100172" },
    ]);
  });

  it("still reads entries after the page changed its markup", () => {
    const doc = page(`<section><article><div><b>Frieren</b></div><div><i>S1 E7 · Ein Ort</i></div></article></section>`);
    expect(readHistory(doc, crunchyrollHistory)).toEqual([{ seriesTitle: "Frieren", season: 1, episode: 7, seriesUrl: null }]);
  });

  it("finds every entry when one container wraps all cards", () => {
    const doc = page(`<article><div class="row"><b>Frieren</b><i>S1 E7</i></div><div class="row"><b>Dandadan</b><i>E12</i></div></article>`);
    expect(readHistory(doc, crunchyrollHistory)?.map((entry) => entry.seriesTitle)).toEqual(["Frieren", "Dandadan"]);
  });

  it.each([["1899"], ["9-1-1"], ["Vor uns das Meer"]])("reads %j as a title, not as a date", (title) => {
    const doc = page(`<div class="history-card"><span>21.10.26</span><h4>${title}</h4><h3>S1 E2</h3></div>`);
    expect(readHistory(doc, crunchyrollHistory)?.[0]?.seriesTitle).toBe(title);
  });

  it("drops a series link that leads away from the service", () => {
    const doc = page(`<div class="history-card"><a href="https://evil.example/frieren"><h4>Frieren</h4></a><h3>S1 E5</h3></div>`);
    expect(readHistory(doc, crunchyrollHistory)?.[0]?.seriesUrl).toBeNull();
  });

  it("is null outside the history pages", () => {
    const doc = page(`<div class="history-card"><h4>Frieren</h4><h3>S1 E5</h3></div>`);
    expect(readHistory(doc, new URL("https://www.crunchyroll.com/watch/GXYZ/x"))).toBeNull();
    expect(readHistory(doc, new URL("https://www.asuracomic.net/history"))).toBeNull();
  });

  it("reads at most a bounded number of entries", () => {
    const cards = Array.from({ length: MAX_HISTORY_ENTRIES + 50 }, (_, i) => `<div class="history-card"><h4>Show ${i}</h4><h3>E1</h3></div>`);
    expect(readHistory(page(cards.join("")), crunchyrollHistory)).toHaveLength(MAX_HISTORY_ENTRIES);
  });
});

describe("isHistoryPage", () => {
  it("knows the history pages of the services", () => {
    expect(isHistoryPage(crunchyrollHistory)).toBe(true);
    expect(isHistoryPage(new URL("https://www.netflix.com/viewingactivity"))).toBe(true);
    expect(isHistoryPage(new URL("https://www.netflix.com/watch/1"))).toBe(false);
    expect(isHistoryPage(new URL("https://www.disneyplus.com/history"))).toBe(false);
  });
});

describe("latestPerSeries", () => {
  it("keeps the highest episode per series, by season first", () => {
    expect(
      latestPerSeries([
        { seriesTitle: "Dark", season: 1, episode: 10, seriesUrl: null },
        { seriesTitle: "Dark", season: 2, episode: 3, seriesUrl: null },
        { seriesTitle: "Dark (German Dub)", season: 2, episode: 1, seriesUrl: null },
        { seriesTitle: "Frieren", season: null, episode: 5, seriesUrl: null },
        { seriesTitle: "Frieren", season: null, episode: 4, seriesUrl: null },
      ]),
    ).toEqual([
      { seriesTitle: "Dark", season: 2, episode: 3, seriesUrl: null },
      { seriesTitle: "Frieren", season: null, episode: 5, seriesUrl: null },
    ]);
  });
});
