"use client";

import { useMemo, useState } from "react";
import { type UpdateItem, type UpdatesShow, type UpdatesSort, updateSections, updatesSummary } from "@/lib/updates";
import { UPDATES_PAGE } from "@/lib/updates-page";
import { UpdateCard } from "./update-card";

const SORTS: { value: UpdatesSort; label: string }[] = [
  { value: "recent", label: "Zuletzt gelesen" },
  { value: "most", label: "Meiste neue" },
];

const GRID = "grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-x-5";

function CardList({ items, label }: { items: UpdateItem[]; label: string }) {
  return (
    <ul aria-label={label} className={GRID}>
      {items.map((item) => (
        <UpdateCard key={item.id} item={item} />
      ))}
    </ul>
  );
}

function Count({ value, strong = false }: { value: number; strong?: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-px text-xs font-semibold tabular-nums ${strong ? "bg-teal-700 text-white dark:bg-teal-300 dark:text-teal-950" : "bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {value}
    </span>
  );
}

/** The updates page (SPEC §4.9): sort and the switch "Alle | Nur neue" work in the browser. */
export function UpdatesScreen({ items, lastCheck }: { items: UpdateItem[]; lastCheck: string }) {
  const [sort, setSort] = useState<UpdatesSort>("recent");
  const [show, setShow] = useState<UpdatesShow>("all");
  const { fresh, rest } = useMemo(() => updateSections(items, { sort, show }), [items, sort, show]);
  const freshCount = useMemo(() => items.filter((item) => item.newChapters > 0).length, [items]);

  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{UPDATES_PAGE.label}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{updatesSummary(items)}</p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{lastCheck}</p>
        </div>
        <div className="flex w-full items-center justify-between gap-2 text-sm sm:w-auto sm:justify-end sm:gap-4">
          <div role="group" aria-label="Anzeige" className="inline-flex gap-1 rounded-lg bg-zinc-200/60 p-1 dark:bg-zinc-800/60">
            {(
              [
                ["all", "Alle", items.length],
                ["new", "Nur neue", freshCount],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={show === value}
                onClick={() => setShow(value)}
                className="rounded-md px-2.5 py-1 text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 aria-pressed:bg-white aria-pressed:font-medium aria-pressed:text-zinc-900 aria-pressed:shadow-sm sm:px-3 dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-950 dark:aria-pressed:text-zinc-100"
              >
                {label} <span className="ml-0.5 text-zinc-500 tabular-nums dark:text-zinc-400">{count}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <span className="sr-only sm:not-sr-only">Reihenfolge</span>
            <select
              value={sort}
              onChange={(event) => setSort(SORTS.find((option) => option.value === event.target.value)?.value ?? "recent")}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-zinc-500 dark:text-zinc-400">Bild: weiterlesen im neuen Tab · Titel: Details</p>

      {items.length === 0 ? (
        <div role="status" className="py-16 text-center text-zinc-600 dark:text-zinc-400">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Noch keine Manga, Manhwa oder Manhua mit bekanntem Stand</p>
          <p className="mt-1 text-sm">
            Werke mit „Kap. ?“ erscheinen hier, sobald ihr Stand in der{" "}
            <a href="/" className="underline">
              Übersicht
            </a>{" "}
            gesetzt ist.
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="updates-fresh" className="mt-7">
            <h2 id="updates-fresh" className="mb-4 flex items-baseline gap-2 text-base font-semibold">
              Neue Kapitel <Count value={fresh.length} strong />
            </h2>
            {fresh.length > 0 ? (
              <CardList items={fresh} label="Neue Kapitel" />
            ) : (
              <p role="status" className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                <span className="block font-medium text-zinc-900 dark:text-zinc-100">Gerade nichts Neues</span>
                Die Extension prüft die Serienseiten einmal am Tag, solange Brave läuft.
              </p>
            )}
          </section>
          {show === "all" ? (
            <section aria-labelledby="updates-rest" className="mt-9">
              <h2 id="updates-rest" className="mb-4 flex items-baseline gap-2 text-base font-semibold">
                Ohne neue Kapitel <Count value={rest.length} />
              </h2>
              {rest.length > 0 ? (
                <CardList items={rest} label="Ohne neue Kapitel" />
              ) : (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Alle Werke haben neue Kapitel.</p>
              )}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
