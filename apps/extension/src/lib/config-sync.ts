import type { ConfigResult } from "./api-client";
import { loadCachedConfig, loadSettings, saveCachedConfig } from "./settings";
import { syncReaderScripts } from "./sites";
import type { Store } from "./storage";

interface Deps {
  store: Store;
  api: { getConfig(apiUrl: string, token: string, etag: string | null): Promise<ConfigResult> };
  scripting: Parameters<typeof syncReaderScripts>[0];
  onUnauthorized: () => void;
  now: () => number;
}

/** Fetches `/config` (ETag) and keeps the reader scripts in line with the enabled sites (SPEC §7.3). */
export async function syncConfig(deps: Deps): Promise<"unpaired" | "updated" | "unchanged" | "error"> {
  const { apiUrl, deviceToken } = await loadSettings(deps.store);
  if (!apiUrl || !deviceToken) {
    // Not paired (or revoked): nothing would be delivered, so nothing is tracked.
    await syncReaderScripts(deps.scripting, null);
    return "unpaired";
  }

  const cached = await loadCachedConfig(deps.store);
  const result = await deps.api.getConfig(apiUrl, deviceToken, cached?.etag ?? null);
  if (!result.ok) {
    if (result.kind === "unauthorized") deps.onUnauthorized();
    return "error";
  }
  if (result.notModified) {
    if (cached) {
      await saveCachedConfig(deps.store, { ...cached, fetchedAt: deps.now() });
      await syncReaderScripts(deps.scripting, cached.config);
    }
    return "unchanged";
  }
  await saveCachedConfig(deps.store, { config: result.config, etag: result.etag, fetchedAt: deps.now() });
  await syncReaderScripts(deps.scripting, result.config);
  return "updated";
}
