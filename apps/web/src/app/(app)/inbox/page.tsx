import { MediaType } from "@rwt/core";
import { HIGH_CONFIDENCE_SCORE, listOpenMatches, type OpenMatch } from "@rwt/server";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getDb } from "@/lib/db";
import { positionText } from "@/lib/format";
import { MEDIA_TYPE_LABELS } from "@/lib/overview";
import { confirmAllAction, ignoreMatchAction, resolveMatchAction } from "./actions";

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const scoreFormat = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function MatchCard({ match }: { match: OpenMatch }) {
  const best = match.candidates[0];
  return (
    <li className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-medium break-words">„{match.rawTitle}“</h2>
      <p className="mt-0.5 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        auf {match.sourceName}
        {match.lastPosition ? ` · zuletzt ${positionText(match.lastPosition)}` : ""} · {match.eventCount}{" "}
        {match.eventCount === 1 ? "Ereignis" : "Ereignisse"}
      </p>

      <ActionForm action={resolveMatchAction} submitLabel="Zuordnen">
        <input type="hidden" name="pendingId" value={match.id} />
        <fieldset className="space-y-2">
          <legend className="sr-only">Zuordnung für „{match.rawTitle}“</legend>
          {match.candidates.map((candidate) => (
            <label key={candidate.workId} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="choice"
                value={candidate.workId}
                defaultChecked={candidate === best}
                className="size-4 accent-teal-700"
              />
              <span className="min-w-0 break-words">
                {candidate.title} ({MEDIA_TYPE_LABELS[candidate.type]}, {positionText(candidate)})
              </span>
              <span className="ml-auto shrink-0 text-xs text-zinc-500 tabular-nums">
                Ähnlichkeit {scoreFormat.format(candidate.score)}
              </span>
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="choice" value="new" defaultChecked={!best} className="size-4 accent-teal-700" />
              Neues Werk anlegen:
            </label>
            <label className="flex items-center gap-1">
              <span className="sr-only">Typ</span>
              <select name="type" defaultValue={match.suggestedType} className={inputClass}>
                {MediaType.options.map((type) => (
                  <option key={type} value={type}>
                    {MEDIA_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-48 flex-1 items-center gap-1">
              <span className="sr-only">Titel</span>
              <input name="title" placeholder={match.rawTitle} maxLength={300} className={`${inputClass} w-full`} />
            </label>
          </div>
        </fieldset>
      </ActionForm>

      <ActionForm action={ignoreMatchAction} submitLabel="Ignorieren – ist kein Werk" danger className="mt-2">
        <input type="hidden" name="pendingId" value={match.id} />
      </ActionForm>
    </li>
  );
}

export default async function InboxPage() {
  const matches = await listOpenMatches(await getDb());
  const confident = matches.filter((match) => (match.candidates[0]?.score ?? 0) >= HIGH_CONFIDENCE_SCORE);

  return (
    <main className="max-w-3xl">
      <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        <span aria-hidden="true">←</span> Übersicht
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">Zuordnungen</h1>

      {matches.length === 0 ? (
        <p role="status" className="py-12 text-center text-zinc-600 dark:text-zinc-400">
          Keine offenen Zuordnungen.
        </p>
      ) : null}

      {confident.length > 1 ? (
        <section className="mb-6 rounded-md border border-teal-300 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/40">
          <h2 className="font-medium">
            {confident.length} Vorschläge mit Ähnlichkeit ≥ {scoreFormat.format(HIGH_CONFIDENCE_SCORE)}
          </h2>
          <ul className="my-3 space-y-1 text-sm">
            {confident.map((match) => (
              <li key={match.id} className="break-words">
                „{match.rawTitle}“ ({match.sourceName}) <span aria-hidden="true">→</span>
                <span className="sr-only">wird zugeordnet zu</span> {match.candidates[0]?.title}
              </li>
            ))}
          </ul>
          <ActionForm action={confirmAllAction} submitLabel="Alle bestätigen">
            {confident.map((match) => (
              <input key={match.id} type="hidden" name="pendingId" value={match.id} />
            ))}
          </ActionForm>
        </section>
      ) : null}

      <ul className="space-y-4">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </ul>
    </main>
  );
}
