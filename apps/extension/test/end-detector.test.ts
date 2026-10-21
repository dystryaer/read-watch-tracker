// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EndSignal, watchChapterEnd } from "../src/reading/end-detector";

interface Metrics {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
}

function fakeObservers() {
  const observed: Element[] = [];
  let callback: ((entries: { target: Element; isIntersecting: boolean }[]) => void) | undefined;
  return {
    observed,
    show(element: Element) {
      callback?.([{ target: element, isIntersecting: true }]);
    },
    create(cb: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
      callback = cb;
      return {
        observe: (element: Element) => observed.push(element),
        disconnect: () => observed.splice(0),
      };
    },
  };
}

let metrics: Metrics;
let signals: EndSignal[];
let stop: () => void;

beforeEach(() => {
  document.body.innerHTML = "";
  metrics = { scrollTop: 0, viewportHeight: 800, scrollHeight: 20_000 };
  signals = [];
});
afterEach(() => stop?.());

function start(options: { endSelector?: string; observers?: ReturnType<typeof fakeObservers> } = {}) {
  const observers = options.observers ?? fakeObservers();
  stop = watchChapterEnd({
    window,
    document,
    scrollDepthPercent: 60,
    endSelector: options.endSelector,
    onEnd: (signal) => signals.push(signal),
    metrics: () => metrics,
    createObserver: observers.create,
  });
  return observers;
}

function scrollTo(scrollTop: number) {
  metrics.scrollTop = scrollTop;
  window.dispatchEvent(new Event("scroll"));
}

describe("watchChapterEnd – scroll depth", () => {
  it("fires once the reader passed the threshold", () => {
    start();
    scrollTo(5000);
    expect(signals).toEqual([]);
    scrollTo(11_400); // (11400 + 800) / 20000 = 61 %
    expect(signals).toEqual(["scroll"]);
  });

  it("fires only once", () => {
    start();
    scrollTo(15_000);
    scrollTo(19_000);
    expect(signals).toEqual(["scroll"]);
  });

  it("ignores scrolling on a page that is barely scrollable (paged readers)", () => {
    metrics.scrollHeight = 1000;
    start();
    scrollTo(200);
    expect(signals).toEqual([]);
  });

  it("stops listening after cleanup", () => {
    start();
    stop();
    scrollTo(19_000);
    expect(signals).toEqual([]);
  });
});

describe("watchChapterEnd – end element", () => {
  it("fires when the rule's end element becomes visible", () => {
    document.body.innerHTML = '<div class="reader"><img></div><a class="next-chapter" href="/c/2">Next</a>';
    const observers = start({ endSelector: "a.next-chapter" });
    const end = document.querySelector("a.next-chapter");
    if (!end) throw new Error("fixture");

    observers.show(end);

    expect(signals).toEqual(["end-visible"]);
  });

  it("observes the last large image of a scrollable page when there is no rule", () => {
    document.body.innerHTML = '<img id="a" height="1200"><img id="b" height="1200"><img id="icon" height="16">';
    const observers = start();

    expect(observers.observed.map((element) => element.id)).toEqual(["b"]);
    observers.show(observers.observed[0] as Element);
    expect(signals).toEqual(["end-visible"]);
  });

  it("does not guess an end element on a paged reader", () => {
    metrics.scrollHeight = 900;
    document.body.innerHTML = '<img id="page" height="1200">';
    const observers = start();
    expect(observers.observed).toEqual([]);
  });

  it("ignores an invalid end selector", () => {
    document.body.innerHTML = '<img id="a" height="1200">';
    expect(() => start({ endSelector: "a[[" })).not.toThrow();
  });

  it("reports only the first signal of either kind", () => {
    document.body.innerHTML = '<img id="a" height="1200">';
    const observers = start();
    scrollTo(19_000);
    observers.show(observers.observed[0] ?? document.body);
    expect(signals).toEqual(["scroll"]);
  });
});

describe("watchChapterEnd – lazy loading", () => {
  it("re-checks the last image when the page adds more", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<img id="a" height="1200">';
    const observers = start();
    const late = document.createElement("img");
    late.id = "late";
    late.setAttribute("height", "1200");
    document.body.append(late);
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();

    expect(observers.observed.map((element) => element.id)).toContain("late");
  });
});
