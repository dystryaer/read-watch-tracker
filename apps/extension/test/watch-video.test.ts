// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { watchVideos } from "../src/streaming/watch-video";

let watched: number;
let accept: boolean;
let clock: number;
let stop: () => void;

function video(duration: number, tag: "video" | "audio" = "video") {
  const element = document.createElement(tag);
  let currentTime = 0;
  Object.defineProperty(element, "duration", { get: () => duration, configurable: true });
  Object.defineProperty(element, "currentTime", { get: () => currentTime, configurable: true });
  document.body.append(element);
  return {
    element,
    playTo(seconds: number) {
      currentTime = seconds;
      element.dispatchEvent(new Event("timeupdate"));
    },
    end() {
      element.dispatchEvent(new Event("ended"));
    },
    newSource(nextDuration: number) {
      duration = nextDuration;
      currentTime = 0;
      element.dispatchEvent(new Event("loadedmetadata"));
    },
  };
}

// The events in these tests are dispatched by the test itself, so the trusted-only filter is off.
function start(options: { trustedOnly?: boolean } = {}) {
  return watchVideos({
    document,
    watchedPercent: 85,
    trustedOnly: options.trustedOnly ?? false,
    now: () => clock,
    onWatched: async () => {
      watched++;
      return accept;
    },
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  watched = 0;
  accept = true;
  clock = 0;
  stop = start();
});
afterEach(() => stop());

describe("watchVideos", () => {
  it("counts an episode once 85 % have been played, and only once", async () => {
    const episode = video(1440);
    episode.playTo(1200);
    expect(watched).toBe(0);
    episode.playTo(1225);
    await settle();
    episode.playTo(1300);
    episode.end();
    expect(watched).toBe(1);
  });

  it("counts an episode that ends, also when the player reports no duration", () => {
    const episode = video(Number.POSITIVE_INFINITY);
    episode.playTo(1300);
    episode.end();
    expect(watched).toBe(1);
  });

  it("ignores short clips such as ads or trailers", () => {
    const ad = video(30);
    ad.playTo(29);
    ad.end();
    expect(watched).toBe(0);
  });

  it("counts the next episode when the player loads it into the same element (autoplay)", async () => {
    const player = video(1440);
    player.playTo(1300);
    await settle();
    player.newSource(1500);
    player.playTo(1400);
    expect(watched).toBe(2);
  });

  it("counts again after the position fell back below the threshold, for players that reuse the element", async () => {
    const player = video(1440);
    player.playTo(1300);
    await settle();
    player.playTo(20); // the next episode streamed into the same element, no new source event
    player.playTo(1300);
    expect(watched).toBe(2);
  });

  it("keeps the signal when the tracker refuses it, and asks again only a few seconds later", async () => {
    accept = false;
    const episode = video(1440);
    episode.playTo(1300);
    await settle();
    episode.playTo(1301);
    expect(watched).toBe(1);

    accept = true;
    clock += 3000;
    episode.playTo(1302);
    await settle();
    episode.playTo(1303);
    expect(watched).toBe(2);
  });

  it("also watches videos added after it started, and ignores audio", () => {
    video(600, "audio").playTo(590);
    const late = video(1440);
    late.playTo(1300);
    expect(watched).toBe(1);
  });

  it("ignores events the page itself made up", () => {
    stop();
    stop = start({ trustedOnly: true });
    const forged = video(1440);
    forged.playTo(1300);
    forged.end();
    expect(watched).toBe(0);
  });

  it("stops listening after cleanup", () => {
    stop();
    video(1440).playTo(1300);
    expect(watched).toBe(0);
  });
});
