// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { watchVideos } from "../src/streaming/watch-video";

let watched: number;
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

beforeEach(() => {
  document.body.innerHTML = "";
  watched = 0;
  stop = watchVideos({ document, watchedPercent: 85, onWatched: () => watched++ });
});
afterEach(() => stop());

describe("watchVideos", () => {
  it("counts an episode once 85 % have been played, and only once", () => {
    const episode = video(1440);
    episode.playTo(1200);
    expect(watched).toBe(0);
    episode.playTo(1225);
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

  it("counts the next episode when the player loads it into the same element (autoplay)", () => {
    const player = video(1440);
    player.playTo(1300);
    player.newSource(1500);
    player.playTo(1400);
    expect(watched).toBe(2);
  });

  it("also watches videos added after it started, and ignores audio", () => {
    video(600, "audio").playTo(590);
    const late = video(1440);
    late.playTo(1300);
    expect(watched).toBe(1);
  });

  it("stops listening after cleanup", () => {
    stop();
    video(1440).playTo(1300);
    expect(watched).toBe(0);
  });
});
