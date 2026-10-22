"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { filterAndSort, keepOrder, type OverviewFilter, type OverviewItem, type SortOrder, type StatusFilter, type Tab } from "@/lib/overview";
import { type OverviewView, viewCookie } from "@/lib/shelf";
import { WorkCard } from "./work-card";
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
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm shadow-xs dark:border-zinc-700 dark:bg-zinc-900";

/** Four small squares and three lines, drawn with classes (the CSP allows no inline styles). */
function ViewIcon({ view }: { view: OverviewView }) {
  return view === "shelf" ? (
    <span aria-hidden="true" className="grid grid-cols-2 gap-0.5">
      {[0, 1, 2, 3].map((square) => (
        <span key={square} className="size-1.5 rounded-[1px] bg-current" />
      ))}
    </span>
  ) : (
    <span aria-hidden="true" className="grid gap-0.5">
      {[0, 1, 2].map((line) => (
        <span key={line} className="h-0.5 w-3 rounded-[1px] bg-current" />
      ))}
    </span>
  );
}

const VIEWS: { value: OverviewView; label: string }[] = [
  { value: "shelf", label: "Regal" },
  { value: "list", label: "Liste" },
];

export function OverviewScreen({
  items,
  pendingCount,
  webnovelHint = null,
  initialView = "shelf",
}: {
  items: OverviewItem[];
  pendingCount: number;
  /** "WebNovel zuletzt vor 9 Tagen synchronisiert." – shown quietly with a link to the library (SPEC §9.1). */
  webnovelHint?: string | null;
  /** The view this browser chose last time, read from its cookie on the server. */
  initialView?: OverviewView;
}) {
  const [view, setView] = useState(initialView);
  const chooseView = (next: OverviewView) => {
    setView(next);
    // A plain preference, read by the server on the next visit (no flash of the other view).
    document.cookie = viewCookie(next);
  };
  const [filter, setFilter] = useState<OverviewFilter>({
    tab: "all",
    status: "reading",
    query: "",
    unknownOnly: false,
    newOnly: false,
    sort: "recent",
  });
  // Typing stays responsive; the list follows a moment later.
  const deferredFilter = useDeferredValue(filter);
  const sorted = useMemo(() => filterAndSort(items, deferredFilter), [items, deferredFilter]);
  // The order is taken when the filter changes, not on every save: "Zuletzt aktiv" would move a
  // row stepped forward to the top, away from under the finger.
  const [order, setOrder] = useState({ filter: deferredFilter, ids: sorted.map((item) => item.id) });
  if (order.filter !== deferredFilter) setOrder({ filter: deferredFilter, ids: sorted.map((item) => item.id) });
  const visible = keepOrder(order.ids, sorted);
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

      {webnovelHint ? (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {webnovelHint}{" "}
          <a href="https://www.webnovel.com/library" target="_blank" rel="noopener noreferrer" className="underline">
            WebNovel-Bibliothek öffnen
          </a>
        </p>
      ) : null}

      <div className="space-y-3">
        <input
          type="search"
          value={filter.query}
          onChange={(event) => update({ query: event.target.value })}
          placeholder="Suche …"
          aria-label="Titel suchen"
          className={`${controlClass} w-full rounded-lg px-3 py-2 text-base`}
        />

        <div
          role="group"
          aria-label="Medientyp"
          className="inline-flex flex-wrap gap-1 rounded-lg bg-zinc-200/60 p-1 dark:bg-zinc-800/60"
        >
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={filter.tab === tab.value}
              onClick={() => update({ tab: tab.value })}
              className="rounded-md px-3 py-1 text-sm text-zinc-600 hover:text-zinc-900 aria-pressed:bg-white aria-pressed:font-medium aria-pressed:text-zinc-900 aria-pressed:shadow-sm dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-950 dark:aria-pressed:text-zinc-100"
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filter.newOnly}
              onChange={(event) => update({ newOnly: event.target.checked })}
              className="size-4 accent-teal-700"
            />
            Neue Kapitel
          </label>
          <div
            role="group"
            aria-label="Ansicht"
            className="inline-flex overflow-hidden rounded-md border border-zinc-300 shadow-xs sm:ml-auto dark:border-zinc-700"
          >
            {VIEWS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={view === option.value}
                onClick={() => chooseView(option.value)}
                className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700 aria-pressed:bg-teal-50 aria-pressed:font-semibold aria-pressed:text-teal-900 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:bg-teal-950 dark:aria-pressed:text-teal-100"
              >
                <ViewIcon view={option.value} />
                {option.label}
              </button>
            ))}
          </div>
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
        <>
          <p className="mt-5 mb-2 text-sm text-zinc-500 dark:text-zinc-400">
            {visible.length === items.length ? `${items.length} Titel` : `${visible.length} von ${items.length} Titeln`}
          </p>
          {view === "shelf" ? (
            // Six columns on a desktop, three on a phone; never wider than the screen.
            <ul
              aria-label="Titel"
              className="grid grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] sm:gap-x-4 sm:gap-y-6"
            >
              {visible.map((item) => (
                <WorkCard key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <ul
              aria-label="Titel"
              className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {visible.map((item) => (
                <WorkRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
