"use client";

import type { Position } from "@rwt/core";
import { useEffect, useRef, useState, useTransition } from "react";
import { setPositionAction } from "@/app/(app)/work-actions";
import { type StepperState, stepPosition } from "@/lib/stepper";
import { useDebouncedSave } from "./use-debounced-save";

/**
 * State of a −/+ control for chapters and episodes (SPEC §4.2). The value changes at once; the
 * final absolute value is saved 500 ms after the last click, so rapid clicks cost one request and
 * never race. Each save names the position it started from: a step from an outdated screen is
 * refused. Several buttons may share one state (the shelf card's −/+ on the picture and its "+").
 */
export function usePositionStepper(workId: string, initial: StepperState) {
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

  return { value, error, saving, change };
}
