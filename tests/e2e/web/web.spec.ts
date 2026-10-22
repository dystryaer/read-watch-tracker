import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";

// Test account of the throwaway E2E database (fresh for every run).
const OWNER = { name: "E2E", email: "e2e@rwt.test", password: "e2e-password-0123456789" };
const XSS_TITLE = '<img src=x onerror="alert(document.cookie)"><script>alert(1)</script>';

test.describe.configure({ mode: "serial" });

let token = "";
let phone: Record<string, string> = {};

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

/** Resolves when a Server Action (a stepper's or slider's save) has answered. */
function actionAnswered(page: import("@playwright/test").Page) {
  return page.waitForResponse((response) => response.request().method() === "POST" && response.request().headers()["next-action"] !== undefined);
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

test("the one-time setup refuses a wrong setup code", async ({ page }) => {
  await page.goto("/setup");
  await page.getByLabel("Einrichtungs-Code").fill("wrong-code-0123456789");
  await page.getByLabel("Name").fill(OWNER.name);
  await page.getByLabel("E-Mail-Adresse").fill(OWNER.email);
  await page.getByLabel(/^Passwort/).fill(OWNER.password);
  await page.getByRole("button", { name: "Konto anlegen" }).click();

  await expect(page.getByText("Der Einrichtungs-Code stimmt nicht.")).toBeVisible();
  await expect(page).toHaveURL(/\/setup$/);
});

test("first visit leads to the one-time setup", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  // Same value as SETUP_TOKEN in playwright.config.ts.
  await page.getByLabel("Einrichtungs-Code").fill("e2e-setup-token-0123456789");
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

  await page.goto("/settings");
  await page.getByLabel("Code").fill("ZZZZZZ");
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByText("Code unbekannt, abgelaufen oder schon benutzt.")).toBeVisible();

  // The QR code leads to a confirmation that names the device, never straight to pairing.
  await page.goto(`/pair?code=${start.code}`);
  await expect(page.getByText("E2E Brave")).toBeVisible();
  await expect(page.getByText(/Browser-Extension · angefragt gerade eben/)).toBeVisible();
  const pending = await (await request.post("/api/v1/pairing/poll", { data: { pollSecret: start.pollSecret } })).json();
  expect(pending.status).toBe("pending");

  await page.getByRole("button", { name: "Koppeln bestätigen" }).click();
  await expect(page.getByText("Gerät gekoppelt.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "E2E Brave" })).toBeVisible();

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
  const saved = actionAnswered(page);
  await row.getByRole("button", { name: "Ein Kapitel weiter" }).click();
  await row.getByRole("button", { name: "Ein Kapitel weiter" }).click();
  await expect(row.getByText("Kap. 347")).toBeVisible();
  await saved;

  await page.reload();
  await expect(
    page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Overgeared", exact: true }) }).getByText("Kap. 347"),
  ).toBeVisible();
});

test("a picture added on the detail page is stored small and shows up in the list", async ({ page, request }) => {
  await login(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Overgeared", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overgeared" })).toBeVisible();

  // A large picture as a phone or website would give it; the browser shrinks it before sending.
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1350;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#0f766e";
      context.fillRect(0, 0, 900, 1350);
    }
    return canvas.toDataURL("image/png").split(",")[1] ?? "";
  });
  await page.getByLabel("Datei auswählen").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.getByText("Bild gespeichert.")).toBeVisible();

  const src = (await page.locator("main img").first().getAttribute("src")) ?? "";
  expect(src).toMatch(/^\/works\/[0-9a-f-]+\/cover\?v=\d+$/);
  const picture = await page.request.get(src);
  expect(picture.headers()["content-type"]).toMatch(/^image\/(webp|jpeg)$/);
  expect((await picture.body()).byteLength).toBeLessThan(30_000);
  // Without a session there is no picture, only the way to the login.
  expect((await request.get(src, { maxRedirects: 0 })).status()).toBe(307);

  await page.goto("/");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Overgeared", exact: true }) });
  await expect(row.locator("img")).toHaveAttribute("src", src);
});

test("an iPhone shortcut token is shown once and lets the shortcut save a shared book", async ({ page, request }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "iPhone-Kurzbefehl hinzufügen" }).click();
  const tokenField = page.getByLabel("Token");
  await expect(tokenField).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
  phone = { authorization: `Bearer ${await tokenField.inputValue()}` };

  const shared = await request.post("/api/v1/share", {
    data: { url: "https://m.webnovel.com/book/22196546206090805", text: "Shadow Slave" },
    headers: phone,
  });
  expect(shared.status()).toBe(200);
  const share = await shared.json();
  expect(share).toMatchObject({ title: "Shadow Slave", unit: "chapter", needsMatch: true });

  const confirmed = await request.post("/api/v1/share/confirm", { data: { shareId: share.shareId, chapter: 12 }, headers: phone });
  expect(await confirmed.json()).toMatchObject({ outcome: "pending", message: "Neuer Titel – bitte im Tracker zuordnen" });

  // The E2E server runs on plain http: the panel says the token would travel unencrypted.
  await expect(page.getByText("ohne https", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByLabel("Token")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "iPhone-Kurzbefehl hinzufügen" })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Token")).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: "iPhone-Kurzbefehl" })).toBeVisible();
});

test("the web app can be installed: manifest and icons load without a session", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  const manifest = await anonymous.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toMatchObject({ start_url: "/quick", display: "standalone" });
  for (const icon of ["/icon", "/apple-icon"]) {
    const response = await anonymous.get(icon, { maxRedirects: 0 });
    expect(response.status(), icon).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await anonymous.dispose();
});

test("the quick update saves the next chapter of a light novel and an e-book's percentage", async ({ page, request }) => {
  const kindle = await (
    await request.post("/api/v1/share", { data: { url: "https://read.amazon.com/kp/kshare?asin=B08FHBV4ZX", text: "Project Hail Mary" }, headers: phone })
  ).json();
  await request.post("/api/v1/share/confirm", { data: { shareId: kindle.shareId, percent: 40 }, headers: phone });

  await login(page);
  await page.goto("/inbox");
  for (const title of ["Shadow Slave", "Project Hail Mary"]) {
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `„${title}“` }) });
    await card.getByRole("radio", { name: /Neues Werk anlegen/ }).check();
    await card.getByRole("button", { name: "Zuordnen" }).click();
    await expect(page.getByRole("heading", { name: `„${title}“` })).toHaveCount(0);
  }

  await page.goto("/quick");
  const novel = page.getByRole("listitem").filter({ hasText: "Shadow Slave" });
  await expect(novel.getByText("Kap. 12")).toBeVisible();
  // Leaving right after the tap loses nothing: the waiting save is sent when the list goes away.
  const novelSaved = actionAnswered(page);
  await novel.getByRole("button", { name: "Ein Kapitel weiter" }).click();
  await page.getByRole("link", { name: "Alle Titel" }).click();
  await novelSaved;

  await page.goto("/quick");
  await expect(page.getByRole("listitem").filter({ hasText: "Shadow Slave" }).getByText("Kap. 13")).toBeVisible();
  const slider = page.getByRole("slider", { name: "Fortschritt von Project Hail Mary" });
  const percentSaved = actionAnswered(page);
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("listitem").filter({ hasText: "Project Hail Mary" }).getByText("40,5 %")).toBeVisible();
  await percentSaved;

  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Shadow Slave" }).getByText("Kap. 13")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Project Hail Mary" }).getByText("40,5 %")).toBeVisible();
});

test("new chapters reported by the extension show as a badge and through a filter", async ({ page, request }) => {
  const auth = { authorization: `Bearer ${token}` };
  // The site is enabled in the extension (its source already exists from the events above), and
  // reading chapter 348 stores the series page – only such works may get a newest chapter.
  const enabled = await request.post("/api/v1/sources/enable", { data: { origin: "https://asuracomic.net", moveFromSourceKey: "site:asuracomic-net" }, headers: auth });
  expect(enabled.status()).toBe(200);
  const read = chapterEvent("overgeared", "Overgeared", 348);
  await postEvents(request, [{ ...read, source: { ...read.source, seriesUrl: "https://asuracomic.net/series/overgeared" } }]);

  const reported = await request.post("/api/v1/latest-chapters", {
    data: { items: [{ sourceKey: "site:asuracomic-net", externalKey: "overgeared", latestChapter: 351 }] },
    headers: auth,
  });
  expect(await reported.json()).toEqual({ updated: 1 });

  await login(page);
  await page.goto("/");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Overgeared", exact: true }) });
  await expect(row.getByText("3 neue Kapitel")).toBeAttached();
  await page.getByRole("checkbox", { name: "Neue Kapitel" }).check();
  await expect(page.getByRole("link", { name: "Overgeared", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Shadow Slave", exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Overgeared", exact: true }).click();
  await expect(page.getByText("Neuestes Kapitel laut Serienseite: Kap. 351")).toBeVisible();
});

test("a series page template in the site rule moves the checked page to the real series page", async ({ page, request }) => {
  await login(page);
  await page.goto(`/settings/sites/${encodeURIComponent("site:asuracomic-net")}`);
  await page.getByLabel(/^Serienseiten-Vorlage/).fill("{origin}/comics/{series}");
  // The live test shows the page the check will open, for the chapter URL I read last.
  await expect(page.getByRole("cell", { name: "https://asuracomic.net/comics/overgeared", exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Regel speichern" }).click();
  await expect(page.getByText(/Regel gespeichert\. 1 Serienseite neu berechnet/)).toBeVisible();

  const watch = await request.get("/api/v1/series-watch", { headers: { authorization: `Bearer ${token}` } });
  expect((await watch.json()).series).toContainEqual(expect.objectContaining({ externalKey: "overgeared", seriesUrl: "https://asuracomic.net/comics/overgeared" }));
});

test("the statistics count this week's chapters as text, with decorative bars", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Statistik" }).click();
  await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible();

  const weeks = page.getByRole("table", { name: "Pro Woche (letzte 12 Wochen)" });
  await expect(weeks.getByRole("row")).toHaveCount(13);
  // The stepper and quick-update tests above saved chapters this week.
  const thisWeek = weeks.getByRole("row").nth(1);
  await expect(thisWeek.getByRole("cell").first()).not.toHaveText("0");
  await expect(page.getByRole("table", { name: "Pro Monat (letzte 12 Monate)" }).getByRole("row")).toHaveCount(13);
});

test("app pages reveal nothing without a session, even to crafted RSC requests", async ({ page, playwright, baseURL }) => {
  await login(page);
  await page.goto("/");
  // The router-state header of a real client-side navigation, as an attacker could copy it.
  const navigation = page.waitForRequest((request) => {
    const headers = request.headers();
    return (
      headers.rsc === "1" &&
      !headers["next-router-prefetch"] &&
      Boolean(headers["next-router-state-tree"]) &&
      new URL(request.url()).pathname === "/settings"
    );
  });
  await page.getByRole("navigation").getByRole("link", { name: "Einstellungen" }).click();
  const realTree = (await navigation).headers()["next-router-state-tree"];
  expect(realTree).toBeTruthy();

  const anonymous = await playwright.request.newContext({ baseURL });
  const trees = [realTree ?? "", encodeURIComponent('["",{"children":["(app)",{"children":["__PAGE__",{}]}]}]')];
  const variants: Record<string, string>[] = [
    ...trees.map((tree) => ({ RSC: "1", "Next-Router-State-Tree": tree })),
    { RSC: "1", "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_tree" },
    { RSC: "1", "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/(app)/settings/__PAGE__" },
  ];
  for (const path of ["/", "/settings", "/inbox"]) {
    for (const headers of variants) {
      const response = await anonymous.get(path, { headers, maxRedirects: 0 });
      const body = await response.text();
      expect(body, `${path} leaked data`).not.toContain("E2E Brave");
      expect(body, `${path} leaked data`).not.toContain("Overgeared");
      expect(body, `${path} leaked data`).not.toContain("Gerät koppeln");
    }
  }
  await anonymous.dispose();
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
