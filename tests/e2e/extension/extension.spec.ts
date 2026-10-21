import { execSync } from "node:child_process";
import path from "node:path";
import { type BrowserContext, chromium, expect, type Page, test, type Worker } from "@playwright/test";
import { type FakeApi, startFakeApi, startFixtureSite } from "./servers";

const EXTENSION_DIR = path.resolve("apps/extension/.output-e2e/chrome-mv3");
const TOKEN = "E".repeat(43);

let api: FakeApi;
let site: Awaited<ReturnType<typeof startFixtureSite>>;
let context: BrowserContext;
let worker: Worker;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  execSync("pnpm --filter @rwt/extension exec wxt build", { stdio: "inherit", env: { ...process.env, RWT_E2E: "1" } });
  site = await startFixtureSite();
  api = await startFakeApi("localhost");

  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

  // Pairing itself is covered by unit tests; here the stored credentials stand in for it.
  await worker.evaluate(
    async ({ apiUrl, token }) => {
      await chrome.storage.local.set({ settings: { apiUrl, deviceToken: token, deviceName: "E2E", pairing: null } });
    },
    { apiUrl: api.url, token: TOKEN },
  );
  await expect
    .poll(async () => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id)), { timeout: 15_000 })
    .toContain("reader:site:fixture");
});

test.afterAll(async () => {
  await context?.close();
  await api?.close();
  await site?.close();
});

const chapterUrl = (host: string, series: string, chapter: number) => `http://${host}:${site.port}/manga/${series}/chapter-${chapter}`;

async function readToEnd(page: Page, url: string) {
  await page.goto(url);
  await page.waitForTimeout(2500); // the reader waits for a stable detection
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
}

function eventsFor(series: string) {
  return api.events.filter((event) => event.source.externalKey === series);
}

test("a chapter read to the end on an enabled site reaches the tracker", async () => {
  const page = await context.newPage();
  await readToEnd(page, chapterUrl("localhost", "solo-leveling", 200));

  await expect.poll(() => eventsFor("solo-leveling").length, { timeout: 10_000 }).toBe(1);
  expect(eventsFor("solo-leveling")[0]).toMatchObject({
    kind: "read",
    source: { key: "site:fixture", externalKey: "solo-leveling", url: chapterUrl("localhost", "solo-leveling", 200) },
    position: { unit: "chapter", chapter: 200 },
  });
  await page.close();
});

test("the same chapter is not counted twice", async () => {
  const page = await context.newPage();
  await readToEnd(page, chapterUrl("localhost", "solo-leveling", 200));
  await page.waitForTimeout(3000);
  expect(eventsFor("solo-leveling")).toHaveLength(1);
  await page.close();
});

test("a chapter is not counted before its end is reached", async () => {
  const page = await context.newPage();
  await page.goto(chapterUrl("localhost", "omniscient-reader", 10));
  await page.waitForTimeout(4000);
  expect(eventsFor("omniscient-reader")).toHaveLength(0);
  await page.close();
});

test("opening the next chapter counts the previous one", async () => {
  const page = await context.newPage();
  await page.goto(chapterUrl("localhost", "eleceed", 50));
  await page.waitForTimeout(1000);
  await page.getByRole("link", { name: "Next" }).click();

  await expect.poll(() => eventsFor("eleceed").map((event) => event.position.chapter), { timeout: 10_000 }).toEqual([50]);
  await page.close();
});

test("pages of sites that are not enabled send nothing", async () => {
  const before = api.requests.filter((request) => request.path === "/api/v1/events").length;
  const page = await context.newPage();
  await readToEnd(page, chapterUrl("127.0.0.1", "nano-machine", 3));
  await page.waitForTimeout(3000);

  expect(api.requests.filter((request) => request.path === "/api/v1/events")).toHaveLength(before);
  expect(eventsFor("nano-machine")).toHaveLength(0);
  await page.close();
});

test("events read while the tracker is unreachable are delivered later, once", async () => {
  api.eventsMode = "unavailable";
  const page = await context.newPage();
  await readToEnd(page, chapterUrl("localhost", "overgeared", 345));
  await expect.poll(() => api.requests.some((request) => request.path === "/api/v1/events" && JSON.stringify(request.body).includes("overgeared")), { timeout: 10_000 }).toBe(true);
  expect(eventsFor("overgeared")).toHaveLength(0);

  api.eventsMode = "ok";
  const options = await context.newPage();
  const extensionId = new URL(worker.url()).host;
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: "options:sync-now" });
    await chrome.runtime.sendMessage({ type: "options:sync-now" });
  });

  await expect.poll(() => eventsFor("overgeared").length, { timeout: 10_000 }).toBe(1);
  await page.close();
  await options.close();
});
