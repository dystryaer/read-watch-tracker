"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UPDATES_PAGE, worksWithNewChaptersLabel } from "@/lib/updates-page";

const LINKS = [
  { href: "/", label: "Übersicht" },
  { href: UPDATES_PAGE.path, label: UPDATES_PAGE.label },
  { href: "/quick", label: "Schnell-Update" },
  { href: "/stats", label: "Statistik" },
  { href: "/settings", label: "Einstellungen" },
];

/** The main navigation; the current section is marked (also for screen readers). */
export function NavLinks({ updates = 0 }: { updates?: number }) {
  const pathname = usePathname();
  const current = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/works/") : pathname.startsWith(href));
  // "Updates 5": works with new chapters (SPEC §4.9), no number at 0. The number alone would say
  // nothing to a screen reader, so the link is named "Updates, 5 Werke mit neuen Kapiteln".
  const counted = (href: string) => href === UPDATES_PAGE.path && updates > 0;
  return (
    <>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={current(link.href) ? "page" : undefined}
          aria-label={counted(link.href) ? `${link.label}, ${worksWithNewChaptersLabel(updates)}` : undefined}
          className="rounded-md px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 aria-[current=page]:bg-teal-50 aria-[current=page]:font-medium aria-[current=page]:text-teal-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:aria-[current=page]:bg-teal-950 dark:aria-[current=page]:text-teal-200"
        >
          {link.label}
          {counted(link.href) ? (
            <span className="ml-1.5 inline-block min-w-5 rounded-full bg-teal-700 px-1.5 text-center text-xs leading-5 font-semibold text-white tabular-nums dark:bg-teal-300 dark:text-teal-950">
              {updates}
            </span>
          ) : null}
        </Link>
      ))}
    </>
  );
}
