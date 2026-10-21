import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";

// Test account of the throwaway E2E database (fresh for every run).
const OWNER = { name: "E2E", email: "e2e@rwt.test", password: "e2e-password-0123456789" };
const XSS_TITLE = '<img src=x onerror="alert(document.cookie)"><script>alert(1)</script>';

test.describe.configure({ mode: "serial" });

let token = "";

function chapterEvent(externalKey: string, rawTitle: string, chapter: number) {
  return {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    kind: "read",
    source: {
      key: "site:asuracomic-net",
      externalKey,
      rawTitle,
      url: `https://asuracomic.net/series/${externalKey}/chapter/${chapter}`,
    },
    position: { unit: "chapter", chapter },
  };
}

async function postEvents(request: APIRequestContext, events: unknown[]) {
  const response = await request.post("/api/v1/events", { data: { events }, headers: { authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(200);
  return response.json();
}

test.beforeEach(async ({ page }) => {
  // Any dialog would mean injected script ran.
  page.on("dialog", (dialog) => {
    throw new Error(`Unexpected dialog: ${dialog.message()}`);
  });
});

test("first visit leads to the one-time setup", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel("Name").fill(OWNER.name);
  await page.getByLabel("E-Mail-Adresse").fill(OWNER.email);
  await page.getByLabel(/^Passwort/).fill(OWNER.password);
  await page.getByRole("button", { name: "Konto anlegen" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Noch keine Titel")).toBeVisible();
});

test("registration is closed once the account exists", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login/);
});

test("pages are served with a nonce-based CSP", async ({ request }) => {
  const response = await request.get("/login");
  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
});

test("login returns to the page that was asked for", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
  await page.getByLabel("E-Mail-Adresse").fill(OWNER.email);
  await page.getByLabel("Passwort").fill(OWNER.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("a device is paired through the settings page", async ({ page, request }) => {
  await login(page);
  const start = await (await request.post("/api/v1/pairing", { data: { kind: "extension", name: "E2E Brave" } })).json();

  await page.goto(`/pair?code=${start.code}`);
  await expect(page.getByLabel("Code")).toHaveValue(start.code);
  await page.getByRole("button", { name: "Koppeln" }).click();
  await expect(page.getByText("Gerät gekoppelt.")).toBeVisible();
  await expect(page.getByText("E2E Brave")).toBeVisible();

  const poll = await (await request.post("/api/v1/pairing/poll", { data: { pollSecret: start.pollSecret } })).json();
  expect(poll.status).toBe("approved");
  token = poll.deviceToken;
});

test("events from a device show up in the inbox, titles rendered as text", async ({ page, request }) => {
  const enabled = await request.post("/api/v1/sources/enable", {
    data: { origin: "https://asuracomic.net" },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(enabled.status()).toBe(200);
  const result = await postEvents(request, [chapterEvent("overgeared", "Overgeared", 345), chapterEvent("xss", XSS_TITLE, 1)]);
  expect(result.results.map((r: { outcome: string }) => r.outcome)).toEqual(["pending", "pending"]);

  await login(page);
  await page.goto("/");
  await expect(page.getByText("2 neue Zuordnungen warten auf Bestätigung")).toBeVisible();
  await page.getByRole("link", { name: /Prüfen/ }).click();

  await expect(page.getByRole("heading", { name: `„${XSS_TITLE}“` })).toBeVisible();
  await expect(page.locator("main img")).toHaveCount(0);
  expect(await page.locator("main script").count()).toBe(0);
});

test("assigning a new work applies the waiting events", async ({ page }) => {
  await login(page);
  await page.goto("/inbox");
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "„Overgeared“" }) });
  await card.getByRole("radio", { name: /Neues Werk anlegen/ }).check();
  await card.getByRole("button", { name: "Zuordnen" }).click();
  await expect(page.getByRole("heading", { name: "„Overgeared“" })).toHaveCount(0);

  await page.goto("/");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Overgeared", exact: true }) });
  await expect(row.getByText("Kap. 345")).toBeVisible();
  const continueLink = row.getByRole("link", { name: /Weiterlesen/ });
  await expect(continueLink).toHaveAttribute("href", "https://asuracomic.net/series/overgeared/chapter/346");
  await expect(continueLink).toHaveAttribute("rel", "noopener noreferrer");
});

test("the stepper saves the chapter after quick clicks", async ({ page }) => {
  await login(page);
  await page.goto("/");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Overgeared", exact: true }) });
  await row.getByRole("button", { name: "Ein Kapitel weiter" }).click();
  await row.getByRole("button", { name: "Ein Kapitel weiter" }).click();
  await expect(row.getByText("Kap. 347")).toBeVisible();
  await page.waitForTimeout(1500); // debounce + save

  await page.reload();
  await expect(
    page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Overgeared", exact: true }) }).getByText("Kap. 347"),
  ).toBeVisible();
});

test("the list fits a phone screen without horizontal scrolling", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
});

test("logging out protects the app again", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/inbox");
  await expect(page).toHaveURL(/\/login\?next=%2Finbox/);
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  if (!page.url().includes("/login")) return; // already signed in
  await page.getByLabel("E-Mail-Adresse").fill(OWNER.email);
  await page.getByLabel("Passwort").fill(OWNER.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
