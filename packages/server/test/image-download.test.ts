import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { downloadImage, isPublicAddress, sniffImageType } from "../src/http/image-download";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

describe("sniffImageType", () => {
  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
    ["WebP", WEBP, "image/webp"],
    ["GIF", Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "image/gif"],
    ["AVIF", Uint8Array.from([0, 0, 0, 28, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]), "image/avif"],
  ])("recognizes %s by its first bytes", (_, bytes, mime) => {
    expect(sniffImageType(bytes)).toBe(mime);
  });

  it.each([
    ["SVG", new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["HTML", new TextEncoder().encode("<!doctype html><title>x</title>")],
    ["too few bytes", Uint8Array.from([0xff, 0xd8])],
  ])("refuses %s", (_, bytes) => {
    expect(sniffImageType(bytes)).toBeNull();
  });
});

describe("isPublicAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.178.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd12::1", "::ffff:192.168.0.1"])(
    "blocks %s (this computer, home network, special ranges)",
    (address) => {
      expect(isPublicAddress(address)).toBe(false);
    },
  );

  it.each(["104.21.32.1", "8.8.8.8", "2606:4700::6810:1"])("allows the public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it("refuses what is no address at all", () => {
    expect(isPublicAddress("tracker.example")).toBe(false);
  });
});

describe("downloadImage", () => {
  let server: http.Server | undefined;
  afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

  /** A plain-HTTP stand-in for an image host; the test hands `http.request` to the downloader. */
  async function host(handler: http.RequestListener) {
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const local = { request: http.request, isAllowed: () => true };
    return { url: (path: string) => `https://127.0.0.1:${port}${path}`, local };
  }

  it("downloads an image and names its type from its bytes", async () => {
    const seen: http.IncomingHttpHeaders[] = [];
    const { url, local } = await host((request, response) => {
      seen.push(request.headers);
      response.writeHead(200, { "content-type": "application/octet-stream" }).end(WEBP);
    });

    const result = await downloadImage(url("/cover.webp"), local);

    expect(result).toEqual({ ok: true, mime: "image/webp", bytes: WEBP });
    expect(seen[0]?.cookie).toBeUndefined();
    expect(seen[0]?.referer).toBeUndefined();
  });

  it("does not follow redirects", async () => {
    const { url, local } = await host((_, response) => response.writeHead(302, { location: "http://192.168.0.1/" }).end());
    expect(await downloadImage(url("/moved"), local)).toEqual({ ok: false, reason: "redirect" });
  });

  it("refuses an answer other than 200", async () => {
    const { url, local } = await host((_, response) => response.writeHead(403).end());
    expect(await downloadImage(url("/hotlink"), local)).toEqual({ ok: false, reason: "status" });
  });

  it("stops reading at the size limit, even without Content-Length", async () => {
    const { url, local } = await host((_, response) => {
      response.writeHead(200);
      response.write(PNG);
      response.end(new Uint8Array(2000));
    });
    expect(await downloadImage(url("/huge.png"), { ...local, maxBytes: 1000 })).toEqual({ ok: false, reason: "too_large" });
  });

  it("refuses what is not a picture", async () => {
    const { url, local } = await host((_, response) => response.writeHead(200, { "content-type": "image/svg+xml" }).end("<svg/>"));
    expect(await downloadImage(url("/logo.svg"), local)).toEqual({ ok: false, reason: "not_image" });
  });

  it("gives up on a host that does not answer", async () => {
    const { url, local } = await host(() => {});
    expect(await downloadImage(url("/slow.jpg"), { ...local, timeoutMs: 200 })).toEqual({ ok: false, reason: "network" });
  });

  it("never connects to this computer or the home network", async () => {
    let hits = 0;
    const { url } = await host((_, response) => {
      hits += 1;
      response.writeHead(200).end(PNG);
    });
    const port = new URL(url("/")).port;

    expect(await downloadImage(url("/cover.png"), { request: http.request })).toEqual({ ok: false, reason: "blocked" });
    expect(await downloadImage(`https://localhost:${port}/cover.png`, { request: http.request })).toEqual({ ok: false, reason: "blocked" });
    expect(hits).toBe(0);
  });

  it.each([
    ["http", "http://cdn.example/a.jpg"],
    ["credentials", "https://user:pw@cdn.example/a.jpg"],
    ["a script link", "javascript:alert(1)"],
  ])("refuses %s addresses without a request", async (_, address) => {
    expect(await downloadImage(address)).toEqual({ ok: false, reason: "invalid_url" });
  });
});
