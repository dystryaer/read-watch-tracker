import { type DeviceConfig, normalizeDomain, parseHttpUrl, type SiteRule } from "@rwt/core";

const READER_PREFIX = "reader:";

/** Match patterns for a site domain: bare and www host, http and https. */
export function readerPatterns(domain: string): string[] {
  return [`https://${domain}/*`, `http://${domain}/*`, `https://www.${domain}/*`, `http://www.${domain}/*`];
}

/** The enabled site a page belongs to, by exact (normalized) host – never by suffix. */
export function findSiteForUrl(config: DeviceConfig | null, url: string): SiteRule | undefined {
  const parsed = parseHttpUrl(url);
  if (!config || !parsed) return undefined;
  const host = normalizeDomain(parsed.hostname);
  return config.sites.find((site) => site.domains.includes(host));
}

interface ScriptingApi {
  getRegisteredContentScripts(): Promise<{ id: string; matches?: string[] }[]>;
  registerContentScripts(scripts: {
    id: string;
    matches: string[];
    js: string[];
    runAt: "document_idle";
    persistAcrossSessions: boolean;
  }[]): Promise<void>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
}

/**
 * Keeps one runtime-registered reader script per enabled site (SPEC §7.2). Chrome injects it only
 * where the user granted host permission, so registering a pattern grants nothing by itself.
 */
export async function syncReaderScripts(scripting: ScriptingApi, config: DeviceConfig | null): Promise<void> {
  const wanted = new Map(
    (config?.sites ?? []).map((site) => [`${READER_PREFIX}${site.sourceKey}`, site.domains.flatMap(readerPatterns)]),
  );
  const registered = (await scripting.getRegisteredContentScripts()).filter((script) => script.id.startsWith(READER_PREFIX));

  const outdated = registered.filter((script) => {
    const matches = wanted.get(script.id);
    return !matches || matches.join("\n") !== (script.matches ?? []).join("\n");
  });
  if (outdated.length > 0) await scripting.unregisterContentScripts({ ids: outdated.map((script) => script.id) });

  const current = new Set(registered.filter((script) => !outdated.includes(script)).map((script) => script.id));
  const missing = [...wanted].filter(([id]) => !current.has(id));
  if (missing.length > 0) {
    await scripting.registerContentScripts(
      missing.map(([id, matches]) => ({ id, matches, js: ["reader.js"], runAt: "document_idle", persistAcrossSessions: true })),
    );
  }
}
