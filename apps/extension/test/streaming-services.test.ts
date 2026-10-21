// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { detectFromMediaMetadata, detectStream, serviceForUrl } from "../src/streaming/services";

// Synthetic layouts (A10): the real pages need a login, so these adapters are unverified until
// samples from the actual sites replace these fixtures.
function page(html: string) {
  document.body.innerHTML = html;
  return document;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.title = "";
});

describe("serviceForUrl", () => {
  it.each([
    ["https://www.netflix.com/watch/81234567?trackId=1", "netflix"],
    ["https://www.primevideo.com/detail/0ABC/ref=atv_dp", "primevideo"],
    ["https://www.amazon.de/gp/video/detail/B0ABC/", "primevideo"],
    ["https://www.disneyplus.com/video/1234-abcd", "disneyplus"],
    ["https://www.crunchyroll.com/watch/GXYZ/the-plan", "crunchyroll"],
    ["https://static.crunchyroll.com/vilos-v2/web/vilos/player.html", "crunchyroll"],
  ])("knows %s", (url, key) => {
    expect(serviceForUrl(url)?.key).toBe(key);
  });

  it.each([
    ["https://www.amazon.de/dp/B0ABC"],
    ["https://netflix.com.evil.example/watch/1"],
    ["https://evilnetflix.com/watch/1"],
    ["http://www.netflix.com/watch/1"],
    ["not a url"],
  ])("does not take %s for a streaming service", (url) => {
    expect(serviceForUrl(url)).toBeUndefined();
  });
});

describe("detectStream – adapters", () => {
  it("reads a Netflix episode", () => {
    const doc = page('<div data-uia="video-title"><h4>Dark</h4><span>F2:E5</span><span>S2:E5</span><span>Lügen</span></div>');
    expect(detectStream(doc, new URL("https://www.netflix.com/watch/81234567"))).toEqual({
      kind: "episode",
      seriesTitle: "Dark",
      season: 2,
      episode: 5,
    });
  });

  it("reads a Netflix film as a movie", () => {
    const doc = page('<div data-uia="video-title">Glass Onion</div>');
    expect(detectStream(doc, new URL("https://www.netflix.com/watch/1"))).toEqual({
      kind: "movie",
      seriesTitle: "Glass Onion",
      season: null,
      episode: null,
    });
  });

  it("reads a Prime Video episode", () => {
    const doc = page(
      '<div class="atvwebplayersdk-title-text">The Boys</div><div class="atvwebplayersdk-subtitle-text">Season 2, Ep. 5 We Gotta Go Now</div>',
    );
    expect(detectStream(doc, new URL("https://www.amazon.de/gp/video/detail/B0ABC/"))).toMatchObject({
      kind: "episode",
      seriesTitle: "The Boys",
      season: 2,
      episode: 5,
    });
  });

  it("reads a Disney+ episode", () => {
    const doc = page('<div class="title-field">Andor</div><div class="subtitle-field">S1:E3 Reckoning</div>');
    expect(detectStream(doc, new URL("https://www.disneyplus.com/video/1"))).toMatchObject({
      kind: "episode",
      seriesTitle: "Andor",
      season: 1,
      episode: 3,
    });
  });

  it("reads a Crunchyroll episode", () => {
    const doc = page(
      '<a data-t="show-title-link" href="/series/G1/frieren"><h4>Frieren: Beyond Journey’s End</h4></a><h1 class="title">E5 - Phantoms of the Dead</h1>',
    );
    expect(detectStream(doc, new URL("https://www.crunchyroll.com/watch/GXYZ/phantoms"))).toMatchObject({
      kind: "episode",
      seriesTitle: "Frieren: Beyond Journey’s End",
      season: null,
      episode: 5,
    });
  });

  it("detects nothing outside the player pages", () => {
    const doc = page('<div data-uia="video-title"><h4>Dark</h4><span>S2:E5</span></div>');
    expect(detectStream(doc, new URL("https://www.netflix.com/browse"))).toBeNull();
  });

  it("detects nothing when the episode label cannot be read, rather than guessing a movie", () => {
    const doc = page('<div class="title-field">Andor</div><div class="subtitle-field">Trailer</div>');
    expect(detectStream(doc, new URL("https://www.disneyplus.com/video/1"))).toBeNull();
  });

  it("caps overly long titles", () => {
    const doc = page(`<div data-uia="video-title"><h4>${"x".repeat(2000)}</h4><span>S1:E1</span></div>`);
    expect(detectStream(doc, new URL("https://www.netflix.com/watch/1"))?.seriesTitle.length).toBeLessThanOrEqual(300);
  });
});

describe("detectFromMediaMetadata", () => {
  it.each([
    [{ title: "S2 E5 – Lügen", artist: "Dark", album: "" }, { seriesTitle: "Dark", season: 2, episode: 5 }],
    [{ title: "Phantoms of the Dead", artist: "Episode 5", album: "Frieren" }, { seriesTitle: "Frieren", season: null, episode: 5 }],
    [{ title: "Frieren S1 E5", artist: "", album: "" }, { seriesTitle: "Frieren", season: 1, episode: 5 }],
  ])("reads %j", (metadata, expected) => {
    expect(detectFromMediaMetadata(metadata)).toEqual({ kind: "episode", ...expected });
  });

  it.each([[{ title: "Some Song", artist: "Some Band", album: "Album" }], [{ title: "S1 E5", artist: "", album: "" }], [null]])(
    "finds no episode in %j",
    (metadata) => {
      expect(detectFromMediaMetadata(metadata)).toBeNull();
    },
  );
});
