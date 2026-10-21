import { MAX_TEXT_LENGTH, normalizeDomain, parseEpisode, parseHttpUrl } from "@rwt/core";

/** What is playing on a streaming page (SPEC §7.5); `episode` is null only for a movie. */
export interface StreamDetection {
  kind: "episode" | "movie";
  seriesTitle: string;
  season: number | null;
  episode: number | null;
}

export type StreamingServiceKey = "netflix" | "primevideo" | "disneyplus" | "crunchyroll";

interface StreamingService {
  key: StreamingServiceKey;
  /** Exact host names (without "www."); a required path prefix limits shared hosts such as amazon.de. */
  hosts: Record<string, string>;
  isPlayerPage(url: URL): boolean;
  detect(doc: Document): StreamDetection | null;
}

/** Manifest match patterns of the streaming content script (SPEC §7.2: fixed service domains). */
export const STREAMING_MATCHES = [
  "https://www.netflix.com/*",
  "https://www.primevideo.com/*",
  "https://www.amazon.de/gp/video/*",
  "https://www.disneyplus.com/*",
  "https://www.crunchyroll.com/*",
  // Crunchyroll plays in a frame on this host; it only reports progress, the page reports the title.
  "https://static.crunchyroll.com/*",
];

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

/**
 * The first label that names an episode decides. Without any label the title is a movie, but only
 * where the service shows no label for movies: an unreadable label means "don't know", not "movie".
 */
function fromLabels(seriesTitle: string, labels: string[], movieWithoutLabel: boolean): StreamDetection | null {
  if (seriesTitle === "") return null;
  for (const label of labels) {
    const episode = parseEpisode(label);
    if (episode) return { kind: "episode", seriesTitle, ...episode };
  }
  const noLabel = labels.every((label) => label === "");
  return movieWithoutLabel && noLabel ? { kind: "movie", seriesTitle, season: null, episode: null } : null;
}

// Adapters for synthetic layouts (A10): unverified until samples of the real pages replace the fixtures.
const SERVICES: StreamingService[] = [
  {
    key: "netflix",
    hosts: { "netflix.com": "/" },
    isPlayerPage: (url) => url.pathname.startsWith("/watch/"),
    detect(doc) {
      const container = doc.querySelector('[data-uia="video-title"]');
      if (!container) return null;
      const heading = container.querySelector("h4");
      if (!heading) return fromLabels(text(container), [], true);
      return fromLabels(text(heading), [...container.querySelectorAll("span")].map(text), false);
    },
  },
  {
    key: "primevideo",
    hosts: { "primevideo.com": "/", "amazon.de": "/gp/video/" },
    isPlayerPage: (url) => url.pathname.includes("/detail/"),
    detect(doc) {
      const title = text(doc.querySelector(".atvwebplayersdk-title-text"));
      return fromLabels(title, [text(doc.querySelector(".atvwebplayersdk-subtitle-text"))], true);
    },
  },
  {
    key: "disneyplus",
    hosts: { "disneyplus.com": "/" },
    isPlayerPage: (url) => url.pathname.startsWith("/video/") || url.pathname.startsWith("/play/"),
    detect(doc) {
      return fromLabels(text(doc.querySelector(".title-field")), [text(doc.querySelector(".subtitle-field"))], true);
    },
  },
  {
    key: "crunchyroll",
    hosts: { "crunchyroll.com": "/", "static.crunchyroll.com": "/" },
    isPlayerPage: (url) => url.hostname === "www.crunchyroll.com" && url.pathname.startsWith("/watch/"),
    detect(doc) {
      return fromLabels(text(doc.querySelector('[data-t="show-title-link"]')), [text(doc.querySelector("h1.title"))], false);
    },
  },
];

/** The streaming service a URL belongs to: https, exact host, and the host's path prefix. */
export function serviceForUrl(raw: string | URL): StreamingService | undefined {
  const url = parseHttpUrl(typeof raw === "string" ? raw : raw.href);
  if (!url || url.protocol !== "https:") return undefined;
  const host = normalizeDomain(url.hostname);
  return SERVICES.find((service) => {
    const prefix = service.hosts[host];
    return Object.hasOwn(service.hosts, host) && prefix !== undefined && url.pathname.startsWith(prefix);
  });
}

/** Detection from the service's own page layout; null outside its player pages. */
export function detectStream(doc: Document, url: URL): StreamDetection | null {
  const service = serviceForUrl(url);
  return service?.isPlayerPage(url) ? service.detect(doc) : null;
}

// Where an episode label starts inside a combined title such as "Frieren S1 E5".
export const LABEL_START = /(?<![\p{L}\d])(?:s\d|season|staffel|episode|folge|ep\.?\s*\d|e\d|\d{1,3}x\d)/iu;

/**
 * Detection from `navigator.mediaSession.metadata`, which players fill in different ways: the
 * series is the album, else another field without an episode label, else the text before the label.
 * Only episodes are taken; a title without a label could be anything.
 */
export function detectFromMediaMetadata(
  metadata: { title?: string; artist?: string; album?: string } | null | undefined,
): StreamDetection | null {
  if (!metadata) return null;
  const fields = [metadata.title, metadata.artist, metadata.album].map((field) =>
    (field ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH),
  );

  for (const [index, field] of fields.entries()) {
    const episode = parseEpisode(field);
    if (!episode) continue;
    const album = fields[2] ?? "";
    const others = fields.filter((other, otherIndex) => otherIndex !== index && other !== "" && !parseEpisode(other));
    const before = field.split(LABEL_START)[0]?.replace(/[\s\-–—:|·,]+$/u, "") ?? "";
    const seriesTitle = (index !== 2 && album !== "" && !parseEpisode(album) ? album : others[0]) ?? before;
    return seriesTitle === "" ? null : { kind: "episode", seriesTitle, ...episode };
  }
  return null;
}
