import { DeviceConfig, HttpUrlSchema, parseHttpUrl } from "@rwt/core";
import { z } from "zod";
import type { Store } from "./storage";

const SETTINGS_KEY = "settings";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https, or plain http only on this machine: the device token must never travel unencrypted. */
function isTrackerOrigin(value: string): boolean {
  const url = parseHttpUrl(value);
  return url !== null && (url.protocol === "https:" || LOCAL_HOSTS.has(url.hostname));
}
const TrackerUrl = HttpUrlSchema.refine(isTrackerOrigin);
const CONFIG_KEY = "config";

const Settings = z.object({
  // Origin of the tracker, e.g. https://tracker.example – checked again on every load.
  apiUrl: TrackerUrl.nullable().catch(null),
  deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/).nullable().catch(null),
  deviceName: z.string().max(100).catch("Brave"),
  pairing: z
    .object({
      apiUrl: TrackerUrl,
      code: z.string().regex(/^[A-Z0-9]{6}$/),
      pollSecret: z.string().min(20).max(100),
      expiresAt: z.iso.datetime({ offset: true }),
    })
    .nullable()
    .catch(null),
});
export type Settings = z.infer<typeof Settings>;

const DEFAULT_SETTINGS: Settings = { apiUrl: null, deviceToken: null, deviceName: "Brave", pairing: null };

export const loadSettings = (store: Store) => store.read(SETTINGS_KEY, Settings, DEFAULT_SETTINGS);
export const saveSettings = (store: Store, settings: Settings) => store.write(SETTINGS_KEY, settings);

export async function updateSettings(store: Store, patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings(store)), ...patch };
  await saveSettings(store, next);
  return next;
}

/** Origin of an API address typed by the user ("https://tracker.example/settings" → "https://tracker.example"). */
export function apiOrigin(raw: string): string | null {
  const origin = parseHttpUrl(raw.trim())?.origin;
  return origin && isTrackerOrigin(origin) ? origin : null;
}

const CachedConfig = z.object({
  config: DeviceConfig,
  etag: z.string().max(200).nullable(),
  fetchedAt: z.number(),
});
export type CachedConfig = z.infer<typeof CachedConfig>;

export const loadCachedConfig = (store: Store) => store.read(CONFIG_KEY, CachedConfig.nullable(), null);
export const saveCachedConfig = (store: Store, config: CachedConfig | null) => store.write(CONFIG_KEY, config);
