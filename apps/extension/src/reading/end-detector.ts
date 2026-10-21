export type EndSignal = "scroll" | "end-visible";

interface Metrics {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
}

interface ObserverLike {
  observe(element: Element): void;
  disconnect(): void;
}

type ObserverFactory = (callback: (entries: { target: Element; isIntersecting: boolean }[]) => void) => ObserverLike;

export interface WatchOptions {
  window: Window;
  document: Document;
  scrollDepthPercent: number;
  endSelector?: string;
  onEnd: (signal: EndSignal) => void;
  metrics?: () => Metrics;
  createObserver?: ObserverFactory;
}

const LARGE_IMAGE_PX = 300;
const RESCAN_DELAY_MS = 500;
// Below this a page is a paged reader (one image per page), where scroll depth says nothing.
const SCROLLABLE_FACTOR = 1.5;

function imageHeight(image: HTMLImageElement): number {
  return image.getBoundingClientRect().height || image.naturalHeight || Number(image.getAttribute("height")) || 0;
}

function queryAll(doc: Document, selector: string): Element[] | null {
  try {
    return [...doc.querySelectorAll(selector)];
  } catch {
    return null;
  }
}

/**
 * Calls `onEnd` once, when the end of a chapter is reached (SPEC §7.4): scroll depth on long-strip
 * pages, or the rule's end element (generic: the last large image) coming into view. There is no
 * fixed reading time, so short and long chapters are treated alike.
 */
export function watchChapterEnd(options: WatchOptions): () => void {
  const { window: win, document: doc } = options;
  const metrics =
    options.metrics ??
    (() => ({ scrollTop: win.scrollY, viewportHeight: win.innerHeight, scrollHeight: doc.documentElement.scrollHeight }));
  const createObserver: ObserverFactory =
    options.createObserver ??
    ((callback) =>
      new IntersectionObserver((entries) =>
        callback(entries.map((entry) => ({ target: entry.target, isIntersecting: entry.isIntersecting }))),
      ));

  let done = false;
  let rescanTimer: ReturnType<typeof setTimeout> | undefined;
  const isScrollable = () => {
    const { viewportHeight, scrollHeight } = metrics();
    return scrollHeight > viewportHeight * SCROLLABLE_FACTOR;
  };

  function finish(signal: EndSignal) {
    if (done) return;
    stop();
    options.onEnd(signal);
  }

  function onScroll() {
    if (!isScrollable()) return;
    const { scrollTop, viewportHeight, scrollHeight } = metrics();
    if (((scrollTop + viewportHeight) / scrollHeight) * 100 >= options.scrollDepthPercent) finish("scroll");
  }

  const observer = createObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) finish("end-visible");
  });

  function endCandidates(): Element[] {
    const fromRule = options.endSelector ? queryAll(doc, options.endSelector) : null;
    if (fromRule && fromRule.length > 0) return fromRule;
    if (!isScrollable()) return [];
    const large = [...doc.querySelectorAll("img")].filter((image) => imageHeight(image) >= LARGE_IMAGE_PX);
    const last = large.at(-1);
    return last ? [last] : [];
  }

  function observeCandidates() {
    observer.disconnect();
    for (const element of endCandidates()) observer.observe(element);
  }

  // Readers load images lazily; re-check the end element when the page grows.
  const mutations = new MutationObserver(() => {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(observeCandidates, RESCAN_DELAY_MS);
  });

  function stop() {
    done = true;
    win.removeEventListener("scroll", onScroll);
    observer.disconnect();
    mutations.disconnect();
    clearTimeout(rescanTimer);
  }

  win.addEventListener("scroll", onScroll, { passive: true });
  mutations.observe(doc.body, { childList: true, subtree: true });
  observeCandidates();
  return stop;
}
