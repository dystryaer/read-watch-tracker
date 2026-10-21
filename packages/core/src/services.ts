import type { MediaType } from "./event";
import { parseHttpUrl } from "./safe-url";

export interface KnownService {
  name: string;
  kind: "streaming" | "app";
  defaultMediaType: MediaType;
  /** The service's own domains; its URLs are only kept on these or their subdomains. */
  domains: string[];
}

const KNOWN_SERVICES: Record<string, KnownService> = {
  crunchyroll: { name: "Crunchyroll", kind: "streaming", defaultMediaType: "anime", domains: ["crunchyroll.com"] },
  primevideo: { name: "Prime Video", kind: "streaming", defaultMediaType: "series", domains: ["primevideo.com", "amazon.de"] },
  netflix: { name: "Netflix", kind: "streaming", defaultMediaType: "series", domains: ["netflix.com"] },
  disneyplus: { name: "Disney+", kind: "streaming", defaultMediaType: "series", domains: ["disneyplus.com"] },
  webnovel: { name: "WebNovel", kind: "app", defaultMediaType: "light_novel", domains: ["webnovel.com"] },
  kindle: { name: "Kindle", kind: "app", defaultMediaType: "ebook", domains: ["read.amazon.com"] },
};

/** Fixed source keys of services and apps (SPEC §5.1); own properties only, so "constructor" is unknown. */
export function knownService(key: string): KnownService | undefined {
  return Object.hasOwn(KNOWN_SERVICES, key) ? KNOWN_SERVICES[key] : undefined;
}

/** "www.example.org" and "example.org" are the same site for source lookups. */
export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/** True for an http(s) URL on one of a known service's domains (or a subdomain of one). */
export function isServiceUrl(key: string, raw: string): boolean {
  const host = parseHttpUrl(raw)?.hostname;
  const domains = knownService(key)?.domains ?? [];
  if (!host) return false;
  const normalized = normalizeDomain(host);
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}
