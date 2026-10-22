import { coverTile } from "@/lib/cover";

// One per TILE_TONES; Tailwind classes, because the CSP allows no inline styles.
const TONES = [
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
];

const SIZES = {
  sm: { box: "h-14 w-10 rounded-md text-xs", width: 40, height: 56 },
  md: { box: "h-16 w-12 rounded-md text-sm", width: 48, height: 64 },
  lg: { box: "h-48 w-32 rounded-lg text-3xl", width: 128, height: 192 },
} as const;

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
        className={`${frame} bg-zinc-100 object-cover dark:bg-zinc-800`}
      />
    );
  }
  const { initials, tone } = coverTile(title);
  return (
    <span aria-hidden="true" className={`${frame} ${TONES[tone]} grid place-items-center font-semibold tracking-wide select-none`}>
      {initials}
    </span>
  );
}
