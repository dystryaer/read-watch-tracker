"use client";

import { positionUnitFor } from "@rwt/core";
import { CoverThumb } from "@/components/cover-thumb";
import type { OverviewItem } from "@/lib/overview";
import { cardAction, coverPosition, plusLabel } from "@/lib/shelf";
import type { StepperState } from "@/lib/stepper";
import { usePositionStepper } from "./use-position-stepper";

interface Stepping {
  state: StepperState;
  change: (delta: 1 | -1) => void;
  saving: boolean;
  error: string | null;
}

/**
 * One work on the shelf (SPEC §4.1): the cover with type, "N neu" and the position on it, −/+ on
 * the picture while the pointer is over the card or the keyboard is in it, and below the title,
 * source, last activity, the continue link and "+".
 */
export function WorkCard({ item }: { item: OverviewItem }) {
  // An unknown position is set on the detail page; stepping from "Kap. ?" to 1 helps nobody.
  return item.stepper && !item.positionUnknown ? <SteppingCard item={item} state={item.stepper} /> : <Card item={item} value={null} />;
}

function SteppingCard({ item, state }: { item: OverviewItem; state: StepperState }) {
  const { value, change, saving, error } = usePositionStepper(item.id, state);
  return <Card item={item} value={value} stepping={{ state, change, saving, error }} />;
}

const BUTTON =
  "inline-flex min-w-0 flex-1 items-center justify-center rounded-md px-2 py-1.5 text-[13px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 max-sm:px-1 max-sm:text-xs";
const ON_PICTURE =
  "grid size-7 place-items-center rounded-md bg-white/95 text-lg leading-none font-semibold text-zinc-900 shadow-sm hover:bg-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-300";
// Hidden but focusable: the keyboard reaches −/+ like any button, and they show up as it arrives.
const REVEAL =
  "pointer-events-none opacity-0 transition-opacity group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100 group-hover/card:pointer-events-auto group-hover/card:opacity-100";

function Card({ item, value, stepping }: { item: OverviewItem; value: number | null; stepping?: Stepping }) {
  const href = `/works/${item.id}`;
  const position = coverPosition(item, value);
  const { action, plus } = cardAction(item);
  const resting = item.status !== "reading";
  const unitName = stepping?.state.unit === "episode" ? "Eine Folge" : "Ein Kapitel";
  const percent = positionUnitFor(item.type) === "percent" ? item.percent : null;

  return (
    <li className="group/card flex min-w-0 flex-col gap-1.5">
      {/* First in the document, below the picture on screen: screen readers and the tab order meet the title first. */}
      <a
        href={href}
        className="order-2 line-clamp-2 text-sm leading-snug font-semibold break-words hover:text-teal-800 hover:underline max-sm:text-[13px] dark:hover:text-teal-300"
      >
        {item.title}
      </a>

      <div className="relative order-1">
        {/* The title link says the same; one tab stop per card is enough. */}
        <a
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className={`block rounded-xl ring-teal-600 ring-offset-2 ring-offset-zinc-50 transition-shadow group-focus-within/card:ring-2 group-hover/card:ring-2 dark:ring-teal-400 dark:ring-offset-zinc-950 ${resting ? "opacity-80 saturate-50" : ""}`}
        >
          <CoverThumb src={item.cover} title={item.title} size="fill" />
        </a>

        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-white/85 px-1.5 py-0.5 text-[11px] leading-tight font-semibold text-zinc-800 shadow-xs max-sm:hidden">
          {item.typeLabel}
        </span>
        {item.status === "completed" ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 right-2 rounded-full bg-sky-700 px-2 py-0.5 text-[11px] leading-tight font-bold text-white shadow-sm max-sm:top-1.5 max-sm:right-1.5"
          >
            ✓ Fertig
          </span>
        ) : position.fresh !== null ? (
          <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-teal-700 px-2 py-0.5 text-xs leading-tight font-bold text-white shadow-sm max-sm:top-1.5 max-sm:right-1.5 max-sm:px-1.5 max-sm:text-[11px]">
            <span aria-hidden="true">{position.fresh} neu</span>
            <span className="sr-only">{position.fresh === 1 ? "1 neues Kapitel" : `${position.fresh} neue Kapitel`}</span>
          </span>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden rounded-b-xl bg-linear-to-t from-black/70 via-black/35 to-transparent px-2.5 pt-8 pb-2 text-white max-sm:px-1.5 max-sm:pt-6 max-sm:pb-1.5">
          <span aria-live="polite" className="block truncate text-[15px] leading-tight font-bold tabular-nums text-shadow-sm max-sm:text-[13px]">
            {position.unknown ? (
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-amber-950 text-shadow-none">
                {position.label}
                <span className="sr-only"> (Stand unbekannt)</span>
              </span>
            ) : (
              position.label
            )}
            {position.latest !== null ? (
              <span className="text-xs font-medium opacity-85 group-focus-within/card:invisible group-hover/card:invisible max-sm:hidden">
                <span aria-hidden="true"> / {position.latest}</span>
                <span className="sr-only">, neuestes Kapitel {position.latest}</span>
              </span>
            ) : null}
            {stepping?.saving ? <span className="sr-only"> wird gespeichert</span> : null}
          </span>
          {percent !== null ? (
            <svg aria-hidden="true" viewBox="0 0 100 4" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-1 w-full">
              <rect width="100" height="4" className="fill-white/35" />
              <rect width={Math.min(100, Math.max(0, percent))} height="4" className="fill-teal-400" />
            </svg>
          ) : null}
        </div>

        {stepping ? (
          <div
            className={`absolute right-2 bottom-1.5 flex gap-1 max-sm:right-auto max-sm:bottom-auto max-sm:left-1/2 max-sm:top-1/2 max-sm:-translate-1/2 ${REVEAL}`}
          >
            <button
              type="button"
              onClick={() => stepping.change(-1)}
              disabled={value === null}
              aria-label={`${unitName} zurück bei ${item.title}`}
              className={ON_PICTURE}
            >
              −
            </button>
            <button type="button" onClick={() => stepping.change(1)} aria-label={`${unitName} weiter bei ${item.title}`} className={ON_PICTURE}>
              +
            </button>
          </div>
        ) : null}
      </div>

      <p className="order-3 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 max-sm:flex-col max-sm:items-start max-sm:gap-0 max-sm:text-[11px] dark:text-zinc-400">
        {item.source ? (
          <>
            <span
              aria-hidden="true"
              className="grid size-4 shrink-0 place-items-center rounded bg-zinc-200 text-[10px] font-bold text-zinc-700 max-sm:hidden dark:bg-zinc-800 dark:text-zinc-300"
            >
              {item.source.initial}
            </span>
            <span className="min-w-0 truncate max-sm:max-w-full">{item.source.label}</span>
          </>
        ) : (
          <span className="min-w-0 truncate max-sm:max-w-full">– keine Seite</span>
        )}
        <span className="ml-auto shrink-0 whitespace-nowrap max-sm:ml-0">
          {item.lastActivity ? <time dateTime={item.lastActivity.iso}>{item.lastActivity.label}</time> : "Import"}
        </span>
      </p>

      <div className="order-4 mt-auto flex gap-1.5 pt-0.5">
        {action.kind === "continue" ? (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BUTTON} bg-teal-700 font-semibold text-white shadow-xs hover:bg-teal-600`}
          >
            {/* One inline run, so the space in "Zuletzt gelesen" survives. Phones show "Weiter ›";
                screen readers still hear "Weiterlesen". */}
            <span>
              {action.short}
              <span className="max-sm:sr-only">{action.label.slice(action.short.length)}</span>
              <span aria-hidden="true">&nbsp;›</span>
            </span>
          </a>
        ) : action.kind === "set-position" ? (
          <a
            href={action.href}
            className={`${BUTTON} border border-amber-300 bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950`}
          >
            Stand setzen
          </a>
        ) : (
          <span className={`${BUTTON} border border-dashed border-zinc-300 font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400`}>
            <span className="truncate">{action.label}</span>
          </span>
        )}
        {plus && stepping ? (
          <button
            type="button"
            onClick={() => stepping.change(1)}
            aria-label={plusLabel(item.title, stepping.state, value)}
            className="grid w-8 shrink-0 place-items-center rounded-md border border-zinc-300 bg-white text-base leading-none font-semibold hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 max-sm:w-7 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            +
          </button>
        ) : null}
      </div>

      {stepping?.error ? (
        <p role="alert" className="order-5 text-xs text-red-700 dark:text-red-400">
          {stepping.error}
        </p>
      ) : null}
    </li>
  );
}
