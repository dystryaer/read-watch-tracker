export interface VideoWatchOptions {
  document: Document;
  /** Share of the duration that counts as watched (SPEC §7.5: 85 %). */
  watchedPercent: number;
  /** Reports the episode; true once the tracker took it. Until then the signal is kept and retried. */
  onWatched: () => Promise<boolean>;
  /** Shorter videos (ads, trailers, previews) never count. */
  minSeconds?: number;
  /** Only events from the browser itself, not ones a page script dispatched (default). */
  trustedOnly?: boolean;
  now?: () => number;
}

const DEFAULT_MIN_SECONDS = 60;
const RETRY_MS = 3000;
// A new source in the same element (autoplay of the next episode) starts a new count.
const NEW_SOURCE_EVENTS = ["loadstart", "loadedmetadata", "emptied"];

interface VideoLike {
  tagName?: string;
  currentTime: number;
  duration: number;
}

/**
 * Calls `onWatched` once per played video when ≥ `watchedPercent` of it ran or it ended. Media
 * events do not bubble, so they are caught in the capture phase on the document, which also
 * covers players that create their video element later. The signal counts as used only when the
 * tracker accepted it; falling back below the threshold (a player streaming the next episode into
 * the same element) arms it again – the tracker drops repeats of the same episode.
 */
export function watchVideos(options: VideoWatchOptions): () => void {
  const { document: doc, watchedPercent, onWatched } = options;
  const minSeconds = options.minSeconds ?? DEFAULT_MIN_SECONDS;
  const trustedOnly = options.trustedOnly ?? true;
  const now = options.now ?? Date.now;
  const counted = new WeakSet<EventTarget>();
  const pending = new WeakSet<EventTarget>();
  const retryAt = new WeakMap<EventTarget, number>();

  const videoOf = (event: Event): VideoLike | null => {
    if (trustedOnly && !event.isTrusted) return null;
    const target = event.target as Partial<VideoLike> | null;
    return target?.tagName === "VIDEO" ? (target as VideoLike) : null;
  };

  function count(target: EventTarget) {
    if (counted.has(target) || pending.has(target) || now() < (retryAt.get(target) ?? 0)) return;
    pending.add(target);
    void onWatched()
      .catch(() => false)
      .then((accepted) => {
        pending.delete(target);
        if (accepted) counted.add(target);
        else retryAt.set(target, now() + RETRY_MS);
      });
  }

  function onProgress(event: Event) {
    const video = videoOf(event);
    if (!video || !event.target) return;
    const { currentTime, duration } = video;
    if (!Number.isFinite(duration) || duration < minSeconds) return;
    if ((currentTime / duration) * 100 >= watchedPercent) count(event.target);
    else counted.delete(event.target);
  }

  function onEnded(event: Event) {
    const video = videoOf(event);
    if (!video || !event.target) return;
    // Without a known duration the played time has to show it was more than a clip.
    const length = Number.isFinite(video.duration) ? video.duration : video.currentTime;
    if (length >= minSeconds) count(event.target);
  }

  function onNewSource(event: Event) {
    if (videoOf(event) && event.target) counted.delete(event.target);
  }

  doc.addEventListener("timeupdate", onProgress, true);
  doc.addEventListener("ended", onEnded, true);
  for (const type of NEW_SOURCE_EVENTS) doc.addEventListener(type, onNewSource, true);
  return () => {
    doc.removeEventListener("timeupdate", onProgress, true);
    doc.removeEventListener("ended", onEnded, true);
    for (const type of NEW_SOURCE_EVENTS) doc.removeEventListener(type, onNewSource, true);
  };
}
