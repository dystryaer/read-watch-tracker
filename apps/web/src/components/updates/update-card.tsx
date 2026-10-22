import { newChaptersLabel, type UpdateItem } from "@/lib/updates";
import { UpdateCover } from "./update-cover";

/** "+3" on the cover: text, not only color; screen readers get it in words. */
function NewBadge({ count }: { count: number }) {
  return (
    <span className="absolute -top-2 -right-2 z-10 inline-flex h-6 min-w-7 items-center justify-center rounded-full bg-teal-700 px-2 text-sm font-bold text-white tabular-nums shadow-md ring-2 ring-zinc-50 dark:bg-teal-300 dark:text-teal-950 dark:ring-zinc-950">
      <span aria-hidden="true">+{count}</span>
      <span className="sr-only">{newChaptersLabel(count)}</span>
    </span>
  );
}

/**
 * One work on the updates page (SPEC §4.9): the picture opens the chapter to read in a new tab,
 * the title below leads to the detail page – two tab stops. Without a known reading page the
 * picture is greyed out and no link.
 */
export function UpdateCard({ item }: { item: UpdateItem }) {
  const fresh = item.newChapters > 0;
  // A ring marks works with new chapters, together with the "+N" and the section's title.
  const frame = `relative block rounded-[10px] ${fresh ? "ring-2 ring-teal-600 ring-offset-2 ring-offset-zinc-50 dark:ring-teal-400 dark:ring-offset-zinc-950" : ""}`;

  return (
    <li className="flex min-w-0 flex-col">
      {item.link ? (
        <a
          href={item.link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={item.link.label}
          className="group block rounded-[14px] focus-visible:outline-3 focus-visible:outline-offset-[6px] focus-visible:outline-teal-800 dark:focus-visible:outline-teal-200"
        >
          <span className={`${frame} transition-transform group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0`}>
            <UpdateCover src={item.cover} title={item.title} />
            {fresh ? <NewBadge count={item.newChapters} /> : null}
            {/* Mouse and keyboard only; on touch screens the card itself is the hint. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-[10px] bg-linear-to-t from-zinc-950/90 to-transparent px-2 pt-8 pb-2 text-xs leading-tight font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:hidden"
            >
              {/* U+FE0E keeps the arrow a plain character; Windows would draw an emoji. */}
              {item.link.cta} {"↗︎"}
            </span>
          </span>
        </a>
      ) : (
        <span className={frame}>
          <span className="block opacity-50 grayscale">
            <UpdateCover src={item.cover} title={item.title} />
          </span>
          {fresh ? <NewBadge count={item.newChapters} /> : null}
        </span>
      )}

      {/* The visible title starts the name, so voice control finds the link by what it shows. */}
      <a
        href={`/works/${item.id}`}
        aria-label={`${item.title}, Details`}
        className="mt-2.5 line-clamp-2 min-h-[2lh] rounded-sm text-[13px] leading-snug font-semibold break-words hover:text-teal-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:hover:text-teal-300"
      >
        {item.title}
      </a>
      <p className="mt-0.5 text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
        {item.positionLabel}
        {item.latestLabel ? <span className="text-zinc-500 dark:text-zinc-400"> {item.latestLabel}</span> : null}
      </p>
      {item.note ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.note}</p> : null}
      {item.link ? null : <p className="text-xs text-zinc-500 italic dark:text-zinc-400">keine Seite bekannt</p>}
    </li>
  );
}
