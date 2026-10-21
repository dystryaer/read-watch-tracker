const DAY_MS = 86_400_000;
// The buckets are calendar days already (SPEC §4.8); UTC keeps them from shifting.
const dayFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

/** "26.10.–1.11." for the week that starts on Monday, 26 October. */
export function weekLabel(start: string): string {
  const monday = new Date(`${start}T00:00:00Z`);
  return `${dayFormat.format(monday)}–${dayFormat.format(new Date(monday.getTime() + 6 * DAY_MS))}`;
}

/** "Oktober 2026". */
export function monthLabel(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

// Literal class names, so Tailwind generates them: inline widths would need 'unsafe-inline' styles (CSP).
const WIDTHS = [
  "w-0",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-full",
] as const;

/** The bar's width relative to the largest value, in 5 % steps; any value above zero shows. */
export function barWidthClass(value: number, max: number): string {
  if (value <= 0 || max <= 0) return WIDTHS[0];
  const step = Math.max(1, Math.round((Math.min(value, max) / max) * 20));
  return WIDTHS[step] ?? WIDTHS[20];
}
