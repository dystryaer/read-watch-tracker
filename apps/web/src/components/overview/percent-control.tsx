"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setPositionAction } from "@/app/(app)/work-actions";

const DEBOUNCE_MS = 500;
const percentFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/**
 * E-book progress on the quick-update screen (SPEC §9.3): the label follows the slider at once,
 * the final value is saved 500 ms after the last change – like the chapter stepper.
 */
export function PercentControl({ workId, title, initial }: { workId: string; title: string; initial: number | null }) {
  const [value, setValue] = useState(initial ?? 0);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(false);
  const latest = useRef(initial ?? 0);
  const serverValue = useRef(initial);

  useEffect(() => () => clearTimeout(timer.current), []);

  // A new value from the server is shown unless a change of mine is still on its way.
  useEffect(() => {
    serverValue.current = initial;
    if (!pending.current) setValue(initial ?? 0);
  }, [initial]);

  function change(next: number) {
    pending.current = true;
    latest.current = next;
    setTouched(true);
    setValue(next);
    setError(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startSaving(async () => {
        const result = await setPositionAction({ workId, position: { unit: "percent", percent: next } });
        // A later change restarted the timer: its own save will answer.
        if (latest.current !== next) return;
        pending.current = false;
        if (!result.ok) {
          setError(result.error);
          setValue(serverValue.current ?? 0);
        }
      });
    }, DEBOUNCE_MS);
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(event) => change(Number(event.currentTarget.value))}
        aria-label={`Fortschritt von ${title}`}
        aria-valuetext={`${percentFormat.format(value)} %`}
        className="w-40 accent-teal-700"
      />
      <span aria-live="polite" className="min-w-14 text-right text-sm tabular-nums">
        {initial === null && !touched ? "? %" : `${percentFormat.format(value)} %`}
        {saving ? <span className="sr-only"> wird gespeichert</span> : null}
      </span>
      {error ? (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
