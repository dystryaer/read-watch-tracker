import { coverTile } from "@/lib/cover";

// One per TILE_TONES; Tailwind classes, because the CSP allows no inline styles. `flat` for the
// small tiles in lists, `fill` for the shelf and the detail page, `wash` behind the detail head.
const TONES = [
  {
    flat: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    fill: "from-rose-100 to-rose-200 text-rose-700 dark:from-rose-950 dark:to-rose-900 dark:text-rose-300",
    wash: "from-rose-100/80 dark:from-rose-950/60",
  },
  {
    flat: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    fill: "from-amber-100 to-amber-200 text-amber-800 dark:from-amber-950 dark:to-amber-900 dark:text-amber-300",
    wash: "from-amber-100/80 dark:from-amber-950/60",
  },
  {
    flat: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300",
    fill: "from-lime-100 to-lime-200 text-lime-800 dark:from-lime-950 dark:to-lime-900 dark:text-lime-300",
    wash: "from-lime-100/80 dark:from-lime-950/60",
  },
  {
    flat: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    fill: "from-emerald-100 to-emerald-200 text-emerald-700 dark:from-emerald-950 dark:to-emerald-900 dark:text-emerald-300",
    wash: "from-emerald-100/80 dark:from-emerald-950/60",
  },
  {
    flat: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
    fill: "from-cyan-100 to-cyan-200 text-cyan-800 dark:from-cyan-950 dark:to-cyan-900 dark:text-cyan-300",
    wash: "from-cyan-100/80 dark:from-cyan-950/60",
  },
  {
    flat: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    fill: "from-sky-100 to-sky-200 text-sky-700 dark:from-sky-950 dark:to-sky-900 dark:text-sky-300",
    wash: "from-sky-100/80 dark:from-sky-950/60",
  },
  {
    flat: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    fill: "from-violet-100 to-violet-200 text-violet-700 dark:from-violet-950 dark:to-violet-900 dark:text-violet-300",
    wash: "from-violet-100/80 dark:from-violet-950/60",
  },
  {
    flat: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
    fill: "from-fuchsia-100 to-fuchsia-200 text-fuchsia-700 dark:from-fuchsia-950 dark:to-fuchsia-900 dark:text-fuchsia-300",
    wash: "from-fuchsia-100/80 dark:from-fuchsia-950/60",
  },
];

const SIZES = {
  sm: { box: "h-14 w-10 rounded-md text-xs", width: 40, height: 56 },
  md: { box: "h-16 w-12 rounded-md text-sm", width: 48, height: 64 },
  lg: { box: "h-48 w-32 rounded-lg text-3xl", width: 128, height: 192 },
  /** As wide as its container, in the 2:3 of a book cover (shelf, detail head). */
  fill: { box: "aspect-[2/3] w-full rounded-xl text-3xl sm:text-4xl", width: 300, height: 450 },
} as const;

/** Gradient classes in the title's tile color, for a soft background behind its cover. */
export function coverWash(title: string): string {
  return TONES[coverTile(title).tone]?.wash ?? "";
}

/**
 * The work's picture, or a colored tile with its initials when it has none. Decorative: the title
 * always stands next to it, so screen readers skip it.
 */
export function CoverThumb({ src, title, size = "sm" }: { src: string | null; title: string; size?: keyof typeof SIZES }) {
  const { box, width, height } = SIZES[size];
  const frame = `${box} shrink-0 shadow-sm ring-1 ring-black/5 dark:ring-white/10`;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className={`${frame} ${size === "fill" ? "block" : ""} bg-zinc-100 object-cover dark:bg-zinc-800`}
      />
    );
  }
  const { initials, tone } = coverTile(title);
  const colors = size === "fill" ? `bg-radial-[at_20%_10%] ${TONES[tone]?.fill} font-bold tracking-wider` : `${TONES[tone]?.flat} font-semibold tracking-wide`;
  return (
    <span aria-hidden="true" className={`${frame} ${colors} grid place-items-center select-none`}>
      {initials}
    </span>
  );
}
