import type { z } from "zod";

/** The subset of chrome.storage.local the extension uses; replaceable by a fake in tests. */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface Store {
  read<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T>;
  write(key: string, value: unknown): Promise<void>;
}

/**
 * Typed access to extension storage. Stored data counts as untrusted (it can be corrupted or
 * edited), so every read is validated; an invalid entry is removed and the fallback is used.
 */
export function createStore(area: StorageArea, warn: (message: string) => void = console.warn): Store {
  return {
    async read(key, schema, fallback) {
      const raw = (await area.get(key))[key];
      if (raw === undefined) return fallback;
      const parsed = schema.safeParse(raw);
      if (parsed.success) return parsed.data;
      warn(`Ignoring corrupt storage entry "${key}"`);
      await area.remove(key);
      return fallback;
    },
    async write(key, value) {
      await area.set({ [key]: value });
    },
  };
}
