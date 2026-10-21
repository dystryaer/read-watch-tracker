import { describe, expect, it } from "vitest";
import { classifySender, ContentMessage, ExtensionPageMessage } from "../src/lib/messages";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const detection = { chapter: 345, seriesKey: "overgeared", title: "Overgeared", seriesUrl: "https://asuracomic.net/series/overgeared" };

describe("ContentMessage", () => {
  it("accepts a chapter-read report", () => {
    expect(
      ContentMessage.safeParse({ type: "reader:chapter-read", url: "https://asuracomic.net/series/overgeared/chapter/345", detection, signal: "scroll" }).success,
    ).toBe(true);
  });

  it.each([
    [{ type: "reader:chapter-read", url: "javascript:alert(1)", detection, signal: "scroll" }],
    [{ type: "reader:chapter-read", url: "https://a.example/x", detection: { ...detection, chapter: -1 }, signal: "scroll" }],
    [{ type: "reader:chapter-read", url: "https://a.example/x", detection: { ...detection, seriesUrl: "javascript:x" }, signal: "scroll" }],
    [{ type: "reader:chapter-read", url: "https://a.example/x", detection, signal: "magic" }],
    [{ type: "popup:enable-site", tabId: 1 }],
    [{ type: "unknown" }],
    ["reader:hello"],
  ])("rejects %j", (message) => {
    expect(ContentMessage.safeParse(message).success).toBe(false);
  });

  it("accepts an empty detection report", () => {
    expect(ContentMessage.safeParse({ type: "reader:detected", url: "https://a.example/x", detection: null }).success).toBe(true);
  });
});

describe("ExtensionPageMessage", () => {
  it("accepts popup commands", () => {
    expect(ExtensionPageMessage.safeParse({ type: "popup:status", tabId: 3 }).success).toBe(true);
    expect(
      ExtensionPageMessage.safeParse({ type: "popup:enable-site", tabId: 3, moveFromSourceKey: "site:asuracomic-net" }).success,
    ).toBe(true);
  });

  it("rejects a malformed source key", () => {
    expect(ExtensionPageMessage.safeParse({ type: "popup:enable-site", tabId: 3, moveFromSourceKey: "<x>" }).success).toBe(false);
  });

  it("accepts a sync request from the options page", () => {
    expect(ExtensionPageMessage.safeParse({ type: "options:sync-now" }).success).toBe(true);
  });
});

describe("classifySender", () => {
  it("recognizes a content script by its tab", () => {
    expect(
      classifySender({ id: EXTENSION_ID, tab: { id: 7 }, url: "https://asuracomic.net/series/x" }, EXTENSION_ID),
    ).toEqual({ kind: "content", tabId: 7 });
  });

  it("recognizes the extension's own pages", () => {
    expect(classifySender({ id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/popup.html` }, EXTENSION_ID)).toEqual({
      kind: "page",
    });
  });

  it("rejects messages from other extensions", () => {
    expect(classifySender({ id: "otherextensionidotherextensionid", tab: { id: 7 } }, EXTENSION_ID)).toEqual({ kind: "foreign" });
  });

  it("does not treat a web page URL without tab as an extension page", () => {
    expect(classifySender({ id: EXTENSION_ID, url: "https://evil.example/" }, EXTENSION_ID)).toEqual({ kind: "foreign" });
  });
});
