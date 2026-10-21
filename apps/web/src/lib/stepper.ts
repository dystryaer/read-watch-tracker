export type StepperUnit = "chapter" | "episode";

export interface StepperState {
  unit: StepperUnit;
  value: number | null;
  season: number | null;
}

const MIN = { chapter: 0, episode: 1 } as const;
const MAX = 99999;

/**
 * Next value for the −/+ buttons. A decimal chapter steps to the neighbouring whole chapter
 * (105.5 → 106 or 105); an unknown position can only go forward, starting at 1.
 */
export function stepPosition(unit: StepperUnit, value: number | null, delta: 1 | -1): number | null {
  if (value === null) return delta === 1 ? 1 : null;
  const next = delta === 1 ? Math.floor(value) + 1 : Math.ceil(value) - 1;
  return Math.min(MAX, Math.max(MIN[unit], next));
}

export function stepperLabel({ unit, value, season }: StepperState): string {
  if (unit === "chapter") return `Kap. ${value ?? "?"}`;
  if (value === null) return "F ?";
  return season === null ? `F${value}` : `S${season} · F${value}`;
}
