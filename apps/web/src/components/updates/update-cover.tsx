import { coverTile } from "@/lib/cover";

// The tones of CoverThumb (same index from coverTile), as full class names for Tailwind and the
// CSP (no inline styles); repeated here so the updates page stands on its own.
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

const FRAME = "aspect-[2/3] w-full rounded-[10px] shadow-sm ring-1 ring-black/5 dark:ring-white/10";

/**
 * The work's picture at full card width in 2:3, from this server only and loaded lazily; without
 * one a large tile with its initials. Decorative: the link around it carries the full name.
 */
export function UpdateCover({ src, title }: { src: string | null; title: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={300}
        height={450}
        loading="lazy"
        decoding="async"
        className={`${FRAME} block h-auto bg-zinc-100 object-cover dark:bg-zinc-800`}
      />
    );
  }
  const { initials, tone } = coverTile(title);
  return (
    <span aria-hidden="true" className={`${FRAME} ${TONES[tone]} grid place-items-center text-3xl font-semibold tracking-wide select-none sm:text-4xl`}>
      {initials}
    </span>
  );
}
