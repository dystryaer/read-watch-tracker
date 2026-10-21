import { SourceKey } from "@rwt/core";
import { getSite, listRecentSiteUrls } from "@rwt/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RuleEditor } from "@/components/sites/rule-editor";
import { getAuthorizedDb } from "@/lib/dal";
import { decodeSegment } from "@/lib/next-path";
import { addDomainAction, renameSiteAction } from "../actions";

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function SitePage({ params }: { params: Promise<{ key: string }> }) {
  const key = SourceKey.safeParse(decodeSegment((await params).key));
  if (!key.success) notFound();
  const db = await getAuthorizedDb();
  const site = await getSite(db, key.data);
  if (!site) notFound();
  const sampleUrls = await listRecentSiteUrls(db, site.id);
  const siteKeyField = <input type="hidden" name="siteKey" value={site.key} />;

  return (
    <main className="max-w-3xl">
      <Link href="/settings/sites" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        <span aria-hidden="true">←</span> Seiten
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold break-words">{site.name}</h1>

      <section className="border-t border-zinc-200 py-5 dark:border-zinc-800">
        <h2 className="mb-3 text-base font-semibold">Name</h2>
        <ActionForm action={renameSiteAction} submitLabel="Umbenennen" className="flex flex-wrap items-end gap-3">
          {siteKeyField}
          <label className="flex flex-col gap-1 text-sm">
            Anzeigename
            <input name="name" defaultValue={site.name} required maxLength={100} className={inputClass} />
          </label>
        </ActionForm>
      </section>

      <section className="border-t border-zinc-200 py-5 dark:border-zinc-800">
        <h2 className="mb-3 text-base font-semibold">Domains</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {site.domains.map((domain) => (
            <li key={domain.domain}>
              <span className="font-mono">{domain.domain}</span>
              {domain.isCurrent ? <span className="ml-2 text-teal-800 dark:text-teal-300">aktuell</span> : null}
            </li>
          ))}
        </ul>
        <ActionForm action={addDomainAction} submitLabel="Domain eintragen" className="flex flex-wrap items-end gap-3">
          {siteKeyField}
          <label className="flex flex-col gap-1 text-sm">
            Domain
            <input name="domain" required placeholder="asurascans.com" autoComplete="off" className={`${inputClass} font-mono`} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="makeCurrent" defaultChecked className="size-4 accent-teal-700" />
            Seite ist dorthin umgezogen
          </label>
        </ActionForm>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Bestehende Zuordnungen bleiben erhalten; „Weiterlesen“ nutzt die aktuelle Domain.
        </p>
      </section>

      <section className="border-t border-zinc-200 py-5 dark:border-zinc-800">
        <h2 className="mb-3 text-base font-semibold">Seitenregel</h2>
        <RuleEditor
          siteKey={site.key}
          domains={site.domains.map((domain) => domain.domain)}
          initial={site.rule}
          sampleUrls={sampleUrls}
        />
      </section>
    </main>
  );
}
