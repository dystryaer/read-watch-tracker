import { listSites } from "@rwt/server";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getDb } from "@/lib/db";
import { setTrackingAction } from "./actions";

export default async function SitesPage() {
  const sites = await listSites(await getDb());
  return (
    <main className="max-w-3xl">
      <Link href="/settings" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        <span aria-hidden="true">←</span> Einstellungen
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold">Seiten</h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Neue Seiten schaltest du im Popup der Browser-Extension frei („Diese Seite tracken“).
      </p>

      {sites.length === 0 ? (
        <p role="status" className="py-12 text-center text-zinc-600 dark:text-zinc-400">Noch keine Seite freigeschaltet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {sites.map((site) => (
            <li key={site.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/settings/sites/${encodeURIComponent(site.key)}`} className="font-medium hover:underline">
                  {site.name}
                </Link>
                <p className="text-zinc-600 dark:text-zinc-400">
                  {site.domains.find((d) => d.isCurrent)?.domain ?? site.domains[0]?.domain ?? "keine Domain"}
                  {site.domains.length > 1 ? ` (+${site.domains.length - 1} alte)` : ""} · {site.linkCount} Titel · {Object.keys(site.rule).length > 0 ? "eigene Regel" : "generisch"}
                </p>
              </div>
              <ActionForm
                action={setTrackingAction}
                submitLabel={site.trackingEnabled ? "Tracking ausschalten" : "Tracking einschalten"}
                danger={site.trackingEnabled}
                className="flex items-center gap-3"
              >
                <input type="hidden" name="siteKey" value={site.key} />
                <input type="hidden" name="enabled" value={site.trackingEnabled ? "false" : "true"} />
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
