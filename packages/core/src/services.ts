import type { MediaType } from "./event";

export interface KnownService {
  name: string;
  kind: "streaming" | "app";
  defaultMediaType: MediaType;
}

const KNOWN_SERVICES: Record<string, KnownService> = {
  crunchyroll: { name: "Crunchyroll", kind: "streaming", defaultMediaType: "anime" },
  primevideo: { name: "Prime Video", kind: "streaming", defaultMediaType: "series" },
  netflix: { name: "Netflix", kind: "streaming", defaultMediaType: "series" },
  disneyplus: { name: "Disney+", kind: "streaming", defaultMediaType: "series" },
  webnovel: { name: "WebNovel", kind: "app", defaultMediaType: "light_novel" },
  kindle: { name: "Kindle", kind: "app", defaultMediaType: "ebook" },
};

/** Fixed source keys of services and apps (SPEC §5.1); own properties only, so "constructor" is unknown. */
export function knownService(key: string): KnownService | undefined {
  return Object.hasOwn(KNOWN_SERVICES, key) ? KNOWN_SERVICES[key] : undefined;
}

/** "www.example.org" and "example.org" are the same site for source lookups. */
export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}
