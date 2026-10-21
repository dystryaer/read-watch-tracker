import { randomUUID } from "node:crypto";
import type { ProgressEvent } from "@rwt/core";
import type { StorageArea } from "../src/lib/storage";

/** In-memory storage that round-trips through JSON like chrome.storage does. */
export function fakeStorage(initial: Record<string, unknown> = {}): StorageArea & { data: Record<string, unknown> } {
  const entries = new Map(Object.entries(structuredClone(initial)));
  return {
    get data() {
      return Object.fromEntries(entries);
    },
    async get(key: string) {
      return entries.has(key) ? { [key]: structuredClone(entries.get(key)) } : {};
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) entries.set(key, JSON.parse(JSON.stringify(value)));
    },
    async remove(key: string) {
      entries.delete(key);
    },
  };
}

export function event(chapter = 1, overrides: Partial<ProgressEvent> = {}): ProgressEvent {
  return {
    id: randomUUID(),
    occurredAt: "2026-10-21T18:00:00.000Z",
    kind: "read",
    source: { key: "site:asura", externalKey: "overgeared", rawTitle: "Overgeared", url: `https://asuracomic.net/x/chapter/${chapter}` },
    position: { unit: "chapter", chapter },
    ...overrides,
  };
}
