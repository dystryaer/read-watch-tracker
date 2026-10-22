"use client";

import { type StepperState, stepperLabel } from "@/lib/stepper";
import { usePositionStepper } from "./use-position-stepper";

const STYLES = {
  md: {
    outer: "inline-flex items-center gap-1.5",
    group: "contents",
    button:
      "grid size-7 place-items-center rounded border border-zinc-300 text-base leading-none hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800",
    label: "min-w-16 text-sm",
  },
  // The detail page's head: one framed control beside the big continue button.
  lg: {
    outer: "inline-flex flex-wrap items-center gap-2",
    group: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white p-1 shadow-xs dark:border-zinc-700 dark:bg-zinc-900",
    button:
      "grid size-8 place-items-center rounded-md bg-zinc-100 text-lg leading-none font-semibold hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:hover:bg-zinc-700",
    label: "min-w-18 font-semibold",
  },
} as const;

/** −/+ for chapters and episodes (SPEC §4.2); saving as in `usePositionStepper`. */
export function PositionStepper({
  workId,
  title,
  initial,
  size = "md",
}: {
  workId: string;
  title: string;
  initial: StepperState;
  size?: keyof typeof STYLES;
}) {
  const { value, error, saving, change } = usePositionStepper(workId, initial);
  const unitName = initial.unit === "chapter" ? "Ein Kapitel" : "Eine Folge";
  const styles = STYLES[size];

  return (
    <div className={styles.outer}>
      <div className={styles.group}>
        <button
          type="button"
          onClick={() => change(-1)}
          disabled={value === null}
          aria-label={`${unitName} zurück bei ${title}`}
          className={styles.button}
        >
          −
        </button>
        <span
          aria-live="polite"
          className={`${styles.label} text-center tabular-nums ${value === null ? "rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" : ""}`}
        >
          {stepperLabel({ ...initial, value })}
          {value === null ? <span className="sr-only"> (Stand unbekannt)</span> : null}
          {saving ? <span className="sr-only"> wird gespeichert</span> : null}
        </span>
        <button type="button" onClick={() => change(1)} aria-label={`${unitName} weiter bei ${title}`} className={styles.button}>
          +
        </button>
      </div>
      {error ? (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
