import { browser } from "wxt/browser";
import { h, render } from "@/lib/dom";
import { ActionReply, PopupStatus } from "@/lib/messages";
import { ruleEditorUrl } from "@/lib/sites";
import "./style.css";

const root = document.getElementById("app");
const relative = new Intl.RelativeTimeFormat("de", { numeric: "auto", style: "short" });

function ago(timestamp: number | null): string {
  if (timestamp === null) return "noch nie";
  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  return Math.abs(minutes) < 1 ? "gerade eben" : Math.abs(minutes) < 60 ? relative.format(minutes, "minute") : relative.format(Math.round(minutes / 60), "hour");
}

async function currentTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function send(message: object) {
  const reply = ActionReply.safeParse(await browser.runtime.sendMessage(message));
  return reply.success ? reply.data : { ok: false as const, error: "Keine Antwort von der Extension." };
}

async function show(notice?: HTMLElement) {
  if (!root) return;
  const tabId = await currentTabId();
  const parsed = tabId === undefined ? null : PopupStatus.safeParse(await browser.runtime.sendMessage({ type: "popup:status", tabId }));
  if (tabId === undefined || !parsed?.success) {
    render(root, h("p", { class: "error" }, "Status konnte nicht geladen werden."));
    return;
  }
  const status = parsed.data;

  if (!status.paired) {
    const settings = h("button", { type: "button" }, "Einstellungen öffnen");
    settings.addEventListener("click", () => void browser.runtime.openOptionsPage());
    render(root, h("h1", {}, "Read-Watch-Tracker"), h("p", {}, "Noch nicht mit deinem Tracker gekoppelt."), settings);
    return;
  }

  const sections: (HTMLElement | null)[] = [];
  const { page } = status;
  if (!page) {
    sections.push(h("p", { class: "muted" }, "Auf dieser Seite gibt es nichts zu tracken."));
  } else if (page.service) {
    sections.push(streamingSection(page.service.name, page.stream));
  } else if (page.site && page.permission) {
    sections.push(...enabledSite(tabId, status, page));
  } else {
    sections.push(enableForm(tabId, status, page));
  }

  const footer = h(
    "p",
    { class: "muted" },
    `Outbox: ${status.outbox.queued} · zuletzt synchronisiert ${ago(status.outbox.lastSyncAt)}`,
    ...(status.outbox.lastError ? [h("br"), h("span", { class: "error" }, status.outbox.lastError)] : []),
  );
  const tracker = status.apiUrl ? h("a", { href: status.apiUrl, target: "_blank", rel: "noopener noreferrer" }, "Tracker öffnen") : null;
  render(root, h("h1", {}, "Read-Watch-Tracker"), notice ?? null, ...sections, h("hr"), footer, tracker);
}

// Streaming services are built in (SPEC §7.5): nothing to enable, only what is being recognized.
function streamingSection(serviceName: string, stream: NonNullable<PopupStatus["page"]>["stream"]): HTMLElement {
  const what = !stream
    ? "Noch keine Folge erkannt. Erkannt wird im Player."
    : stream.kind === "movie"
      ? `${stream.seriesTitle} · Film erkannt`
      : `${stream.seriesTitle} · ${stream.season === null ? "" : `S${stream.season} · `}F${stream.episode} erkannt`;
  return h(
    "div",
    {},
    h("p", {}, what),
    h("p", { class: "muted" }, `${serviceName}: wird automatisch gezählt, sobald 85 % gesehen sind.`),
  );
}

function enabledSite(tabId: number, status: PopupStatus, page: NonNullable<PopupStatus["page"]>): HTMLElement[] {
  const site = page.site;
  if (!site) return [];
  const ruleLink = status.apiUrl
    ? h("a", { href: ruleEditorUrl(status.apiUrl, site.sourceKey, page.url), target: "_blank", rel: "noopener noreferrer" }, "Regel bearbeiten")
    : null;
  const disable = h("button", { type: "button", class: "secondary" }, "Deaktivieren");
  disable.addEventListener("click", async () => {
    await browser.permissions.remove({ origins: [`${page.origin}/*`] });
    await show(h("p", { class: "muted" }, "Diese Domain wird nicht mehr getrackt."));
  });

  const detection = page.detection;
  const items: HTMLElement[] = [];
  if (!detection) {
    items.push(h("p", {}, "Kein Kapitel erkannt."));
  } else {
    items.push(h("p", {}, h("strong", {}, detection.title ?? detection.seriesKey), ` · Kap. ${detection.chapter} erkannt`));
    if (page.ignored) items.push(h("p", { class: "muted" }, "Diese Serie wird ignoriert."));
    else if (page.counted) items.push(h("p", { class: "ok" }, "✓ gezählt"));
    else items.push(h("p", { class: "muted" }, "Wird gezählt, sobald das Kapitelende erreicht ist."));
  }

  const actions = h("div", { class: "row" }, disable, ruleLink);
  if (detection && !page.ignored) {
    const ignore = h("button", { type: "button", class: "danger" }, "Falsch erkannt? Serie ignorieren");
    ignore.addEventListener("click", async () => {
      const reply = await send({ type: "popup:ignore-series", tabId });
      await show(reply.ok ? undefined : h("p", { class: "error", role: "alert" }, reply.error ?? "Fehlgeschlagen."));
    });
    actions.append(ignore);
  }
  return [...items, h("p", { class: "muted" }, `Quelle: ${site.domains.join(", ")}`), actions];
}

function enableForm(tabId: number, status: PopupStatus, page: NonNullable<PopupStatus["page"]>): HTMLElement {
  const nameInput = h("input", { type: "text", maxlength: "100", "aria-label": "Name der neuen Quelle" });
  nameInput.value = page.domain;
  const newSource = h("input", { type: "radio", name: "mode", value: "new", checked: "" });
  const move = h("input", { type: "radio", name: "mode", value: "move" });
  const moveSelect = h("select", { "aria-label": "Umzug von" }, ...status.sites.map((site) => h("option", { value: site.sourceKey }, site.domains.join(", "))));
  const button = h("button", { type: "submit" }, "Diese Seite tracken");
  const form = h(
    "form",
    {},
    h("p", {}, `${page.domain} ist nicht freigeschaltet.`),
    h("label", {}, newSource, "Neue Quelle:", nameInput),
    status.sites.length > 0 ? h("label", {}, move, "Umzug von:", moveSelect) : null,
    button,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.setAttribute("disabled", "");
    // Asked on this click (SPEC §7.2): host access to exactly this origin.
    const granted = await browser.permissions.request({ origins: [`${page.origin}/*`] });
    if (!granted) {
      await show(h("p", { class: "error", role: "alert" }, "Ohne Berechtigung kann diese Seite nicht getrackt werden."));
      return;
    }
    const isMove = move.checked && status.sites.length > 0;
    const reply = await send({
      type: "popup:enable-site",
      tabId,
      ...(isMove ? { moveFromSourceKey: moveSelect.value } : { name: nameInput.value.trim() || page.domain }),
    });
    await show(reply.ok ? h("p", { class: "ok" }, isMove ? "Umzug eingetragen." : "Seite freigeschaltet.") : h("p", { class: "error", role: "alert" }, reply.error ?? "Fehlgeschlagen."));
  });
  return form;
}

void show();
