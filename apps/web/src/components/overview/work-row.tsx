import type { ReactNode } from "react";
import type { OverviewItem } from "@/lib/overview";
import { PositionStepper } from "./position-stepper";

/** One work in the core screen list (SPEC §4.1): title, position, source, activity, continue link. */
export function WorkRow({ item, actions }: { item: OverviewItem; actions?: ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-zinc-200 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_11rem_7rem_9rem] dark:border-zinc-800">
      <div className="min-w-0">
        <a href={`/works/${item.id}`} className="block truncate font-medium hover:underline">
          {item.title}
        </a>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.typeLabel}</span>
        {item.newChapters !== null ? (
          <span className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-xs font-medium text-teal-900 dark:bg-teal-900/40 dark:text-teal-100">
            <span aria-hidden="true">{item.newChapters} neu</span>
            <span className="sr-only">{item.newChapters === 1 ? "1 neues Kapitel" : `${item.newChapters} neue Kapitel`}</span>
          </span>
        ) : null}
      </div>

      <div className="text-right sm:text-left">
        {item.stepper ? (
          <PositionStepper key={item.id} workId={item.id} title={item.title} initial={item.stepper} />
        ) : item.positionUnknown ? (
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            {item.positionLabel}
            <span className="sr-only">(Stand unbekannt)</span>
          </span>
        ) : (
          <span className="text-sm tabular-nums">{item.positionLabel}</span>
        )}
      </div>

      {/* One line on phones; `sm:contents` turns both parts into their own grid columns on wider screens. */}
      <div className="col-span-2 flex min-w-0 items-center gap-3 text-sm text-zinc-600 sm:contents dark:text-zinc-400">
        <div className="flex min-w-0 items-center gap-2">
          {item.source ? (
            <>
              <span
                aria-hidden="true"
                className="grid size-5 shrink-0 place-items-center rounded bg-zinc-200 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {item.source.initial}
              </span>
              <span className="truncate">{item.source.label}</span>
            </>
          ) : (
            <span>– keine Seite</span>
          )}
        </div>
        <div className="shrink-0 text-zinc-500 dark:text-zinc-400">
          {item.lastActivity ? <time dateTime={item.lastActivity.iso}>{item.lastActivity.label}</time> : "Import"}
        </div>
      </div>

      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
        {actions}
        {item.continueLink ? (
          <a
            href={item.continueLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-teal-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {item.continueLink.label} <span aria-hidden="true">›</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}
