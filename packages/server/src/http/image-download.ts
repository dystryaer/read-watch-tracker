import { type LookupAddress, lookup as dnsLookup } from "node:dns";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { parseHttpUrl } from "@rwt/core";
import type { COVER_MIME_TYPES } from "@rwt/db";

export type CoverMime = (typeof COVER_MIME_TYPES)[number];
export const MAX_COVER_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;

export type DownloadResult =
  | { ok: true; mime: CoverMime; bytes: Uint8Array }
  | { ok: false; reason: "invalid_url" | "blocked" | "redirect" | "status" | "too_large" | "not_image" | "network" };

/** The picture's type from its first bytes, never from what a server claims. SVG is no picture here. */
export function sniffImageType(bytes: Uint8Array): CoverMime | null {
  const at = (offset: number, ...signature: number[]) => signature.every((byte, index) => bytes[offset + index] === byte);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(4, 0x66, 0x74, 0x79, 0x70) && (at(8, 0x61, 0x76, 0x69, 0x66) || at(8, 0x61, 0x76, 0x69, 0x73))) return "image/avif";
  return null;
}

// This computer, the home network and other special ranges: a picture address from a page or a
// device token must never make the tracker reach into them (SSRF).
const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv4");
}
// No rule for ::ffff:0:0/96: BlockList checks IPv4 addresses as mapped ones, it would block them all.
for (const [network, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  // An IPv4 address written as IPv6 (::ffff:192.168.0.1) is judged as the IPv4 address it is.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return isPublicAddress(mapped);
  return !NOT_PUBLIC.check(address, family === 6 ? "ipv6" : "ipv4");
}

type Request = typeof https.request;
type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

class BlockedAddressError extends Error {}

/**
 * Downloads one picture for a cover: https only, no cookies, no Referer, no redirects, at most
 * `maxBytes`, and only from public addresses – checked on the address the connection really uses,
 * so a DNS answer cannot switch to the home network between check and connect.
 */
export function downloadImage(
  rawUrl: string,
  {
    request = https.request,
    isAllowed = isPublicAddress,
    maxBytes = MAX_COVER_BYTES,
    timeoutMs = TIMEOUT_MS,
  }: { request?: Request; isAllowed?: (address: string) => boolean; maxBytes?: number; timeoutMs?: number } = {},
): Promise<DownloadResult> {
  const url = parseHttpUrl(rawUrl);
  if (!url || url.protocol !== "https:") return Promise.resolve({ ok: false, reason: "invalid_url" });
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  // Literal addresses skip the lookup below, so they are checked here.
  if (isIP(hostname) && !isAllowed(hostname)) return Promise.resolve({ ok: false, reason: "blocked" });

  const lookup = (host: string, options: { all?: boolean }, callback: LookupCallback) => {
    dnsLookup(host, { all: true }, (error, addresses) => {
      if (error) return callback(error, "");
      const blocked = addresses.length === 0 || addresses.some((entry) => !isAllowed(entry.address));
      if (blocked) return callback(new BlockedAddressError(host), "");
      const [first] = addresses;
      if (options.all) callback(null, addresses);
      else callback(null, first?.address ?? "", first?.family);
    });
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DownloadResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      outgoing.destroy();
      resolve(result);
    };
    const outgoing = request(
      {
        hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        lookup: lookup as never,
        headers: { "user-agent": "Read-Watch-Tracker", accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) return finish({ ok: false, reason: "redirect" });
        if (status !== 200) return finish({ ok: false, reason: "status" });
        if (Number(response.headers["content-length"]) > maxBytes) return finish({ ok: false, reason: "too_large" });

        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > maxBytes) return finish({ ok: false, reason: "too_large" });
          chunks.push(chunk);
        });
        response.on("end", () => {
          const bytes = new Uint8Array(Buffer.concat(chunks));
          const mime = sniffImageType(bytes);
          finish(mime ? { ok: true, mime, bytes } : { ok: false, reason: "not_image" });
        });
        response.on("error", () => finish({ ok: false, reason: "network" }));
      },
    );
    const deadline = setTimeout(() => finish({ ok: false, reason: "network" }), timeoutMs);
    outgoing.on("error", (error) => finish({ ok: false, reason: error instanceof BlockedAddressError ? "blocked" : "network" }));
    outgoing.end();
  });
}
