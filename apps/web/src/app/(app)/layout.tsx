import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { RefreshOnReturn } from "@/components/refresh-on-return";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <div className="mx-auto max-w-5xl px-4 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
        <Link href="/" className="text-lg font-semibold">
          Read-Watch-Tracker
        </Link>
        <nav aria-label="Hauptnavigation" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/quick" className="hover:underline">
            Schnell-Update
          </Link>
          <Link href="/stats" className="hover:underline">
            Statistik
          </Link>
          <Link href="/settings" className="hover:underline">
            Einstellungen
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="hover:underline">
              Abmelden
            </button>
          </form>
        </nav>
      </header>
      <RefreshOnReturn />
      {children}
    </div>
  );
}
