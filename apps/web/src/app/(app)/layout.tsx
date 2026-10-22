import { countWorksWithNewChapters } from "@rwt/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { NavLinks } from "@/components/nav-links";
import { RefreshOnReturn } from "@/components/refresh-on-return";
import { getAuthorizedDb } from "@/lib/dal";

/** The app icon's open book, drawn with classes (the CSP allows no inline styles). */
function BrandMark() {
  return (
    <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-teal-700 shadow-sm">
      <span className="flex gap-0.5">
        <span className="h-3.5 w-2.5 rounded-l-sm bg-white" />
        <span className="h-3.5 w-2.5 rounded-r-sm bg-white" />
      </span>
    </span>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The session check comes with the database; the count is one aggregate (SPEC §4.9).
  const updates = await countWorksWithNewChapters(await getAuthorizedDb());
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <BrandMark />
            Read-Watch-Tracker
          </Link>
          {/* One scrollable row on phones instead of two wrapped ones. */}
          <nav
            aria-label="Hauptnavigation"
            className="-mx-2.5 flex w-[calc(100%+1.25rem)] items-center gap-1 overflow-x-auto text-sm whitespace-nowrap [scrollbar-width:none] sm:w-auto"
          >
            <NavLinks updates={updates} />
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                Abmelden
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-12">
        <RefreshOnReturn />
        {children}
      </div>
    </>
  );
}
