"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Übersicht" },
  { href: "/quick", label: "Schnell-Update" },
  { href: "/stats", label: "Statistik" },
  { href: "/settings", label: "Einstellungen" },
];

/** The main navigation; the current section is marked (also for screen readers). */
export function NavLinks() {
  const pathname = usePathname();
  const current = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/works/") : pathname.startsWith(href));
  return (
    <>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={current(link.href) ? "page" : undefined}
          className="rounded-md px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 aria-[current=page]:bg-teal-50 aria-[current=page]:font-medium aria-[current=page]:text-teal-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:aria-[current=page]:bg-teal-950 dark:aria-[current=page]:text-teal-200"
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}
