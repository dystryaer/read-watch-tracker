"use client";

import type { Position } from "@rwt/core";
import { useEffect, useRef, useState, useTransition } from "react";
import { setPositionAction } from "@/app/(app)/work-actions";
import { type StepperState, stepperLabel, stepPosition } from "@/lib/stepper";
import { useDebouncedSave } from "./use-debounced-save";

/**
 * −/+ for chapters and episodes (SPEC §4.2). Updates the label at once and saves the final
 * absolute value 500 ms after the last click, so rapid clicks cost one request and never race.
 * Each save names the position it started from: a step from an outdated screen is refused.
 */
export function PositionStepper({ workId, title, initial }: { workId: string; title: string; initial: StepperState }) {
  const [value, setValue] = useState(initial.value);
  // Clicks faster than a re-render must still add up, so the latest value lives in a ref too.
  const latest = useRef(initial.value);
  // What the server holds as far as this stepper knows: the base the next save is checked against.
  const base = useRef(initial.value);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // True from the first click until its save has answered.
  const pending = useRef(false);
  const serverValue = useRef(initial.value);

  const positionOf = (number: number | null): Position | null => {
    if (number === null) return null;
    return initial.unit === "chapter" ? { unit: "chapter", chapter: number } : { unit: "episode", season: initial.season, episode: number };
  };

  const scheduleSave = useDebouncedSave(() => {
    const next = latest.current;
    const position = positionOf(next);
    if (position === null) return;
    const expected = positionOf(base.current);
    base.current = next;
    startSaving(async () => {
      const result = await setPositionAction({ workId, position, expected });
      // A later click restarted the timer: its own save will answer.
      if (latest.current !== next) return;
      pending.current = false;
      if (!result.ok) {
        setError(result.error);
        latest.current = serverValue.current;
        base.current = serverValue.current;
        setValue(serverValue.current);
      }
    });
  });

  // A new value from the server (e.g. an event from a device) is shown unless a click of mine is
  // still on its way. Never remounting keeps a click made during a save from being dropped.
  useEffect(() => {
    serverValue.current = initial.value;
    if (pending.current) return;
    latest.current = initial.value;
    base.current = initial.value;
    setValue(initial.value);
  }, [initial.value]);

  function change(delta: 1 | -1) {
    const next = stepPosition(initial.unit, latest.current, delta);
    if (next === null || next === latest.current) return;
    latest.current = next;
    pending.current = true;
    setValue(next);
    setError(null);
    scheduleSave();
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
        aria-label={`${unitName} zurück bei ${title}`}
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
      <button type="button" onClick={() => change(1)} aria-label={`${unitName} weiter bei ${title}`} className={buttonClass}>
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
