// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { latestPerSeries, MAX_HISTORY_ENTRIES, readHistory } from "../src/streaming/history";

// Synthetic history pages (A10): unverified until samples of the real pages replace them.
function page(html: string) {
  document.body.innerHTML = html;
  return document;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("readHistory", () => {
  it("reads the Crunchyroll history", () => {
    const doc = page(`
      <div class="history-card"><h4>Frieren: Beyond Journey’s End</h4><h3>S1 E5 - Phantoms of the Dead</h3><span>vor 2 Tagen</span></div>
      <div class="history-card"><h4>Dandadan</h4><h3>E12 - Let's Go to the Cursed House</h3></div>`);
    expect(readHistory(doc, new URL("https://www.crunchyroll.com/history"))).toEqual([
      { seriesTitle: "Frieren: Beyond Journey’s End", season: 1, episode: 5 },
      { seriesTitle: "Dandadan", season: null, episode: 12 },
    ]);
  });

  it("reads the Prime Video watch history", () => {
    const doc = page(`<ul><li class="watch-history-item"><p>21. Oktober 2026</p><a>The Boys</a><span>Staffel 2, Folge 5</span></li></ul>`);
    expect(readHistory(doc, new URL("https://www.amazon.de/gp/video/settings/watch-history"))).toEqual([
      { seriesTitle: "The Boys", season: 2, episode: 5 },
    ]);
  });

  it("reads Netflix entries that name an episode, and skips those that only name its title", () => {
    const doc = page(`<ul>
      <li class="retableRow"><div class="col date">21.10.26</div><div class="col title"><a href="/title/1">Dark: Staffel 2: Folge 5</a></div></li>
      <li class="retableRow"><div class="col date">20.10.26</div><div class="col title"><a href="/title/1">Dark: Staffel 2: „Lügen“</a></div></li>
    </ul>`);
    expect(readHistory(doc, new URL("https://www.netflix.com/viewingactivity"))).toEqual([{ seriesTitle: "Dark", season: 2, episode: 5 }]);
  });

  it("still reads entries after the page changed its markup", () => {
    const doc = page(`<section><article><div><b>Frieren</b></div><div><i>S1 E7 · Ein Ort</i></div></article></section>`);
    expect(readHistory(doc, new URL("https://www.crunchyroll.com/history"))).toEqual([{ seriesTitle: "Frieren", season: 1, episode: 7 }]);
  });

  it("is null outside the history pages", () => {
    const doc = page(`<div class="history-card"><h4>Frieren</h4><h3>S1 E5</h3></div>`);
    expect(readHistory(doc, new URL("https://www.crunchyroll.com/watch/GXYZ/x"))).toBeNull();
    expect(readHistory(doc, new URL("https://www.asuracomic.net/history"))).toBeNull();
  });

  it("reads at most a bounded number of entries", () => {
    const cards = Array.from({ length: MAX_HISTORY_ENTRIES + 50 }, (_, i) => `<div class="history-card"><h4>Show ${i}</h4><h3>E1</h3></div>`);
    expect(readHistory(page(cards.join("")), new URL("https://www.crunchyroll.com/history"))).toHaveLength(MAX_HISTORY_ENTRIES);
  });
});

describe("latestPerSeries", () => {
  it("keeps the highest episode per series, by season first", () => {
    expect(
      latestPerSeries([
        { seriesTitle: "Dark", season: 1, episode: 10 },
        { seriesTitle: "Dark", season: 2, episode: 3 },
        { seriesTitle: "Dark (German Dub)", season: 2, episode: 1 },
        { seriesTitle: "Frieren", season: null, episode: 5 },
        { seriesTitle: "Frieren", season: null, episode: 4 },
      ]),
    ).toEqual([
      { seriesTitle: "Dark", season: 2, episode: 3 },
      { seriesTitle: "Frieren", season: null, episode: 5 },
    ]);
  });
});
