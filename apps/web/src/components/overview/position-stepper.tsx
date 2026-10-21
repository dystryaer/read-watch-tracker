"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setPositionAction } from "@/app/(app)/work-actions";
import { type StepperState, stepperLabel, stepPosition } from "@/lib/stepper";

const DEBOUNCE_MS = 500;

/**
 * −/+ for chapters and episodes (SPEC §4.2). Updates the label at once and saves the final
 * absolute value 500 ms after the last click, so rapid clicks cost one request and never race.
 */
export function PositionStepper({ workId, initial }: { workId: string; initial: StepperState }) {
  const [value, setValue] = useState(initial.value);
  // Clicks faster than a re-render must still add up, so the latest value lives in a ref too.
  const latest = useRef(initial.value);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function change(delta: 1 | -1) {
    const next = stepPosition(initial.unit, latest.current, delta);
    if (next === null || next === latest.current) return;
    latest.current = next;
    setValue(next);
    setError(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startSaving(async () => {
        const position =
          initial.unit === "chapter"
            ? { unit: "chapter" as const, chapter: next }
            : { unit: "episode" as const, season: initial.season, episode: next };
        const result = await setPositionAction({ workId, position });
        if (!result.ok) {
          setError(result.error);
          latest.current = initial.value;
          setValue(initial.value);
        }
      });
    }, DEBOUNCE_MS);
  }

  const unitName = initial.unit === "chapter" ? "Ein Kapitel" : "Eine Folge";
  const buttonClass =
    "grid size-7 place-items-center rounded border border-zinc-300 text-base leading-none hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => change(-1)}
        disabled={value === null}
        aria-label={`${unitName} zurück`}
        className={buttonClass}
      >
        −
      </button>
      <span
        aria-live="polite"
        className={`min-w-16 text-center text-sm tabular-nums ${value === null ? "rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" : ""}`}
      >
        {stepperLabel({ ...initial, value })}
        {value === null ? <span className="sr-only"> (Stand unbekannt)</span> : null}
        {saving ? <span className="sr-only"> wird gespeichert</span> : null}
      </span>
      <button type="button" onClick={() => change(1)} aria-label={`${unitName} weiter`} className={buttonClass}>
        +
      </button>
      {error ? (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
