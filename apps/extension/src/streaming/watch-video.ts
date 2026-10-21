export interface VideoWatchOptions {
  document: Document;
  /** Share of the duration that counts as watched (SPEC §7.5: 85 %). */
  watchedPercent: number;
  onWatched: () => void;
  /** Shorter videos (ads, trailers, previews) never count. */
  minSeconds?: number;
}

const DEFAULT_MIN_SECONDS = 60;
// A new source in the same element (autoplay of the next episode) starts a new count.
const NEW_SOURCE_EVENTS = ["loadstart", "loadedmetadata", "emptied"];

/**
 * Calls `onWatched` once per played video when ≥ `watchedPercent` of it ran or it ended. Media
 * events do not bubble, so they are caught in the capture phase on the document, which also
 * covers players that create their video element later.
 */
export function watchVideos(options: VideoWatchOptions): () => void {
  const { document: doc, watchedPercent, onWatched } = options;
  const minSeconds = options.minSeconds ?? DEFAULT_MIN_SECONDS;
  const counted = new WeakSet<EventTarget>();

  const videoOf = (event: Event) => {
    const target = event.target as { tagName?: string; currentTime?: number; duration?: number } | null;
    return target?.tagName === "VIDEO" ? (target as { currentTime: number; duration: number }) : null;
  };

  function count(target: EventTarget) {
    if (counted.has(target)) return;
    counted.add(target);
    onWatched();
  }

  function onProgress(event: Event) {
    const video = videoOf(event);
    if (!video || !event.target) return;
    const { currentTime, duration } = video;
    if (!Number.isFinite(duration) || duration < minSeconds) return;
    if ((currentTime / duration) * 100 >= watchedPercent) count(event.target);
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
