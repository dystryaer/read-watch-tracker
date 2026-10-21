import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <div className="mx-auto max-w-5xl px-4 pb-12">
      <header className="flex items-center justify-between gap-4 py-4">
        <Link href="/" className="text-lg font-semibold">
          Read-Watch-Tracker
        </Link>
        <nav aria-label="Hauptnavigation" className="flex items-center gap-4 text-sm">
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
      {children}
    </div>
  );
}
