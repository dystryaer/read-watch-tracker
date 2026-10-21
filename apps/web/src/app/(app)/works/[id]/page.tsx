import { MediaType, positionUnitFor, safeHref } from "@rwt/core";
import { getWorkDetail, listMergeCandidates } from "@rwt/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { HistoryTable } from "@/components/work-detail/history-table";
import { getAuthorizedDb } from "@/lib/dal";
import { positionText } from "@/lib/format";
import { formatRelative, MEDIA_TYPE_LABELS } from "@/lib/overview";
import { mergeAction, setPositionFormAction, setStatusFormAction, unlinkAction, updateMetaAction } from "./actions";

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const STATUS_LABELS = { reading: "Lese", completed: "Abgeschlossen", dropped: "Abgebrochen" } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-zinc-200 py-5 dark:border-zinc-800">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const db = await getAuthorizedDb();
  const [detail, mergeCandidates] = await Promise.all([getWorkDetail(db, id.data), listMergeCandidates(db, id.data)]);
  if (!detail) notFound();
  const { work, links, events } = detail;
  const unit = positionUnitFor(work.type);
  const workIdField = <input type="hidden" name="workId" value={work.id} />;

  return (
    <main className="max-w-3xl">
      <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        <span aria-hidden="true">←</span> Übersicht
      </Link>
      <h1 className="mt-2 text-2xl font-semibold break-words">{work.title}</h1>
      <p className="mt-1 mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {MEDIA_TYPE_LABELS[work.type]} · {STATUS_LABELS[work.status]} · {positionText(work)}
      </p>
      {unit === "chapter" && work.latestChapter !== null && work.latestChapterAt !== null ? (
        <p className="-mt-2 mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Neuestes Kapitel laut Serienseite: Kap. {work.latestChapter} (geprüft {formatRelative(work.latestChapterAt, new Date())})
        </p>
      ) : null}

      <Section title="Titel und Typ">
        <ActionForm action={updateMetaAction} submitLabel="Speichern">
          {workIdField}
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
              Titel
              <input name="title" defaultValue={work.title} required maxLength={300} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Typ
              <select name="type" defaultValue={work.type} className={inputClass}>
                {MediaType.options.map((type) => (
                  <option key={type} value={type}>
                    {MEDIA_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ein Typ, der anders zählt (z. B. Manhwa → Anime), setzt den Stand zurück.
          </p>
        </ActionForm>
      </Section>

      {unit !== "none" ? (
        <Section title="Stand setzen">
          <ActionForm action={setPositionFormAction} submitLabel="Stand setzen" className="flex flex-wrap items-end gap-3">
            {workIdField}
            <input type="hidden" name="unit" value={unit} />
            {unit === "chapter" ? (
              <label className="flex flex-col gap-1 text-sm">
                Kapitel
                <input name="chapter" type="number" min={0} max={99999.99} step={0.01} defaultValue={work.chapter ?? ""} required className={inputClass} />
              </label>
            ) : unit === "episode" ? (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  Staffel (optional)
                  <input name="season" type="number" min={1} max={999} defaultValue={work.season ?? ""} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Folge
                  <input name="episode" type="number" min={1} max={99999} defaultValue={work.episode ?? ""} required className={inputClass} />
                </label>
              </>
            ) : (
              <label className="flex flex-col gap-1 text-sm">
                Prozent
                <input name="percent" type="number" min={0} max={100} step={0.01} defaultValue={work.percent ?? ""} required className={inputClass} />
              </label>
            )}
          </ActionForm>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Hier darf der Stand auch zurückgesetzt werden.</p>
        </Section>
      ) : null}

      <Section title="Status">
        <ActionForm action={setStatusFormAction} submitLabel="Status speichern" className="flex flex-wrap items-end gap-3">
          {workIdField}
          <label className="flex flex-col gap-1 text-sm">
            Status
            <select name="status" defaultValue={work.status} className={inputClass}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </ActionForm>
      </Section>

      <Section title="Quellen">
        {links.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Noch keiner Seite zugeordnet. Beim ersten Lesen auf einer Seite erscheint eine Zuordnungsanfrage.
          </p>
        ) : (
          <ul className="space-y-3">
            {links.map((link) => {
              const href = safeHref(link.seriesUrl);
              return (
                <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{link.sourceName}</span>
                    <span className="text-zinc-600 dark:text-zinc-400"> · „{link.externalTitle}“</span>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="ml-2 underline">
                        Serienseite
                      </a>
                    ) : null}
                  </div>
                  <ActionForm action={unlinkAction} submitLabel="Lösen" danger className="flex items-center gap-3">
                    {workIdField}
                    <input type="hidden" name="linkId" value={link.id} />
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Verlauf (letzte 50)">
        <HistoryTable events={events} />
      </Section>

      <Section title="Zusammenführen">
        {mergeCandidates.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Kein passender Titel zum Zusammenführen vorhanden.</p>
        ) : (
          <ActionForm action={mergeAction} submitLabel="Zusammenführen" danger>
            {workIdField}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Überträgt Quellen und Verlauf auf den gewählten Titel und löscht diesen hier. Der weitere Stand gewinnt.
            </p>
            <label className="flex flex-col gap-1 text-sm">
              Zusammenführen mit
              <select name="intoId" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Titel wählen …
                </option>
                {mergeCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title} ({MEDIA_TYPE_LABELS[candidate.type]})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" required className="size-4 accent-red-700" />
              Ja, „{work.title}“ wird danach gelöscht.
            </label>
          </ActionForm>
        )}
      </Section>
    </main>
  );
}
