import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

export interface FakeApi {
  url: string;
  requests: RecordedRequest[];
  events: { id: string; source: { key: string; externalKey: string; url?: string }; position: { chapter?: number }; kind: string }[];
  eventsMode: "ok" | "unavailable";
  close(): Promise<void>;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}

function listen(server: Server, host: string): Promise<number> {
  return new Promise((resolve) => server.listen(0, host, () => resolve((server.address() as AddressInfo).port)));
}

/** Stand-in for the tracker's device API: records what the extension sends. */
export async function startFakeApi(siteDomain: string): Promise<FakeApi> {
  const api: FakeApi = {
    url: "",
    requests: [],
    events: [],
    eventsMode: "ok",
    close: async () => {},
  };
  const config = { sites: [{ sourceKey: "site:fixture", domains: [siteDomain] }], thresholds: { scrollDepthPercent: 60, watchedPercent: 85 } };

  const server = createServer(async (request, response) => {
    const path = request.url ?? "";
    const body = request.method === "POST" ? await readBody(request) : null;
    api.requests.push({ method: request.method ?? "", path, body });
    response.setHeader("content-type", "application/json");

    if (request.method === "GET" && path === "/api/v1/config") {
      response.setHeader("etag", '"v1"');
      if (request.headers["if-none-match"] === '"v1"') return response.writeHead(304).end();
      return response.end(JSON.stringify(config));
    }
    if (request.method === "POST" && path === "/api/v1/events") {
      if (api.eventsMode === "unavailable") return response.writeHead(503).end("{}");
      const events = (body as { events: FakeApi["events"] }).events;
      const fresh = events.filter((event) => !api.events.some((known) => known.id === event.id));
      api.events.push(...fresh);
      return response.end(JSON.stringify({ results: events.map((event, index) => ({ id: event.id, index, outcome: "pending" })) }));
    }
    response.writeHead(404).end("{}");
  });
  const port = await listen(server, "127.0.0.1");
  api.url = `http://127.0.0.1:${port}`;
  api.close = () => new Promise((resolve) => server.close(() => resolve()));
  return api;
}

function chapterPage(series: string, chapter: number): string {
  // A long-strip reader: tall images, so scrolling to the end is needed.
  const pixel = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  const images = Array.from({ length: 12 }, () => `<img src="${pixel}" width="600" height="1200" alt="">`).join("\n");
  return `<!doctype html><html><head><title>${series} Chapter ${chapter} - Fixture Reader</title></head>
<body style="margin:0"><h1>${series}</h1><div class="reader">${images}</div>
<a class="next" href="/manga/${series.toLowerCase().replaceAll(" ", "-")}/chapter-${chapter + 1}">Next</a></body></html>`;
}

function pagedChapterPage(series: string, chapter: number): string {
  // A paged reader: one page in view, nothing to scroll. Its "next chapter" link leads to a page
  // that is not a chapter, so only the click itself can count the chapter.
  const pixel = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  return `<!doctype html><html><head><title>${series} Chapter ${chapter} - Fixture Reader</title></head>
<body style="margin:0"><img src="${pixel}" width="400" height="400" alt="">
<a class="next" href="/about">Nächstes Kapitel</a></body></html>`;
}

/** A manga site with long-strip (/manga/) and paged (/paged/) chapter pages, reachable as localhost and 127.0.0.1. */
export async function startFixtureSite(): Promise<{ port: number; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    if (request.url === "/about") return response.writeHead(200, { "content-type": "text/html" }).end("<p>About</p>");
    const paged = /^\/paged\/([a-z-]+)\/chapter-(\d+)$/.exec(request.url ?? "");
    if (paged?.[1] && paged[2]) {
      const title = paged[1].split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
      return response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(pagedChapterPage(title, Number(paged[2])));
    }
    const match = /^\/manga\/([a-z-]+)\/chapter-(\d+)$/.exec(request.url ?? "");
    if (!match?.[1] || !match[2]) return response.writeHead(404).end("not found");
    const series = match[1].split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(chapterPage(series, Number(match[2])));
  });
  const port = await listen(server, "0.0.0.0");
  return { port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
