import type { MediaType } from "./event";
import { parseHttpUrl } from "./safe-url";

export interface KnownService {
  name: string;
  kind: "streaming" | "app";
  defaultMediaType: MediaType;
  /**
   * The service's own hosts (without "www.") with the path prefix that belongs to it there; a
   * shared host such as amazon.de only counts below its prefix. One table for client and server.
   */
  hosts: Record<string, string>;
}

const KNOWN_SERVICES: Record<string, KnownService> = {
  crunchyroll: {
    name: "Crunchyroll",
    kind: "streaming",
    defaultMediaType: "anime",
    // The player runs in a frame on static.crunchyroll.com.
    hosts: { "crunchyroll.com": "/", "static.crunchyroll.com": "/" },
  },
  primevideo: {
    name: "Prime Video",
    kind: "streaming",
    defaultMediaType: "series",
    hosts: { "primevideo.com": "/", "amazon.de": "/gp/video/" },
  },
  netflix: { name: "Netflix", kind: "streaming", defaultMediaType: "series", hosts: { "netflix.com": "/" } },
  disneyplus: { name: "Disney+", kind: "streaming", defaultMediaType: "series", hosts: { "disneyplus.com": "/" } },
  webnovel: { name: "WebNovel", kind: "app", defaultMediaType: "light_novel", hosts: { "webnovel.com": "/", "m.webnovel.com": "/" } },
  kindle: { name: "Kindle", kind: "app", defaultMediaType: "ebook", hosts: { "read.amazon.com": "/" } },
};

/** Fixed source keys of services and apps (SPEC §5.1); own properties only, so "constructor" is unknown. */
export function knownService(key: string): KnownService | undefined {
  return Object.hasOwn(KNOWN_SERVICES, key) ? KNOWN_SERVICES[key] : undefined;
}

/** "www.example.org" and "example.org" are the same site for source lookups. */
export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/** The service a URL belongs to: https, an exact host of the service, and that host's path prefix. */
export function serviceKeyForUrl(raw: string): string | undefined {
  const url = parseHttpUrl(raw);
  if (!url || url.protocol !== "https:") return undefined;
  const host = normalizeDomain(url.hostname);
  return Object.keys(KNOWN_SERVICES).find((key) => {
    const hosts = KNOWN_SERVICES[key]?.hosts ?? {};
    const prefix = Object.hasOwn(hosts, host) ? hosts[host] : undefined;
    return prefix !== undefined && url.pathname.startsWith(prefix);
  });
}

/** True for a URL of the given service; such URLs are the only ones its events may carry. */
export function isServiceUrl(key: string, raw: string): boolean {
  return knownService(key) !== undefined && serviceKeyForUrl(raw) === key;
}

/** True for a host of a known service: it can never become a website source. */
export function isServiceHost(hostname: string): boolean {
  const host = normalizeDomain(hostname);
  return Object.values(KNOWN_SERVICES).some((service) => Object.hasOwn(service.hosts, host));
}
