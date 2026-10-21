"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { filterAndSort, type OverviewFilter, type OverviewItem, type SortOrder, type StatusFilter, type Tab } from "@/lib/overview";
import { WorkRow } from "./work-row";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "comics", label: "Manga/Manhwa/Manhua" },
  { value: "novels", label: "Light Novels" },
  { value: "ebooks", label: "E-Books" },
  { value: "video", label: "Serien/Anime" },
];

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "reading", label: "Lese" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "dropped", label: "Abgebrochen" },
  { value: "all", label: "Alle" },
];

// Values from a <select> are plain strings; only known options are accepted.
function pick<T extends string>(options: readonly { value: T }[], raw: string, fallback: T): T {
  return options.find((option) => option.value === raw)?.value ?? fallback;
}

const SORTS: { value: SortOrder; label: string }[] = [
  { value: "recent", label: "Zuletzt aktiv" },
  { value: "title", label: "Titel A–Z" },
];

const controlClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function OverviewScreen({ items, pendingCount }: { items: OverviewItem[]; pendingCount: number }) {
  const [filter, setFilter] = useState<OverviewFilter>({
    tab: "all",
    status: "reading",
    query: "",
    unknownOnly: false,
    sort: "recent",
  });
  // Typing stays responsive; the list follows a moment later.
  const deferredFilter = useDeferredValue(filter);
  const visible = useMemo(() => filterAndSort(items, deferredFilter), [items, deferredFilter]);
  const update = (patch: Partial<OverviewFilter>) => setFilter((current) => ({ ...current, ...patch }));

  return (
    <main>
      <h1 className="sr-only">Übersicht</h1>

      {pendingCount > 0 ? (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <span>
            {pendingCount === 1
              ? "1 neue Zuordnung wartet auf Bestätigung"
              : `${pendingCount} neue Zuordnungen warten auf Bestätigung`}
          </span>
          <a href="/inbox" className="font-medium underline">
            Prüfen <span aria-hidden="true">→</span>
          </a>
        </div>
      ) : null}

      <div className="space-y-3">
        <input
          type="search"
          value={filter.query}
          onChange={(event) => update({ query: event.target.value })}
          placeholder="Suche …"
          aria-label="Titel suchen"
          className={`${controlClass} w-full py-2 text-base`}
        />

        <div role="group" aria-label="Medientyp" className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={filter.tab === tab.value}
              onClick={() => update({ tab: tab.value })}
              className="rounded-md px-2.5 py-1 text-sm hover:bg-zinc-100 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:hover:bg-zinc-800 dark:aria-pressed:bg-zinc-100 dark:aria-pressed:text-zinc-900"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            Status
            <select
              value={filter.status}
              onChange={(event) => update({ status: pick(STATUSES, event.target.value, "reading") })}
              className={controlClass}
            >
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Sortierung
            <select
              value={filter.sort}
              onChange={(event) => update({ sort: pick(SORTS, event.target.value, "recent") })}
              className={controlClass}
            >
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filter.unknownOnly}
              onChange={(event) => update({ unknownOnly: event.target.checked })}
              className="size-4 accent-teal-700"
            />
            Stand unbekannt
          </label>
        </div>
      </div>

      {items.length === 0 ? (
        <div role="status" className="py-16 text-center text-zinc-600 dark:text-zinc-400">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Noch keine Titel</p>
          <p className="mt-1 text-sm">
            Importiere deine Excel-Liste oder koppel die Browser-Extension unter{" "}
            <a href="/settings" className="underline">
              Einstellungen
            </a>
            .
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p role="status" className="py-16 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Keine Titel passen zu diesem Filter.
        </p>
      ) : (
        <ul aria-label="Titel" className="mt-4 border-t border-zinc-200 dark:border-zinc-800">
          {visible.map((item) => (
            <WorkRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}
