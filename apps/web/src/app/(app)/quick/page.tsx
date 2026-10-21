import { listOverview } from "@rwt/server";
import type { Metadata } from "next";
import Link from "next/link";
import { QuickList } from "@/components/overview/quick-list";
import { getAuthorizedDb } from "@/lib/dal";
import { quickUpdateItems, toOverviewItem } from "@/lib/overview";

export const metadata: Metadata = { title: "Schnell-Update · Read-Watch-Tracker" };

/** Start page of the installed web app (SPEC §9.3): next chapter or percentage in at most two taps. */
export default async function QuickUpdatePage() {
  const now = new Date();
  const items = quickUpdateItems((await listOverview(await getAuthorizedDb())).map((row) => toOverviewItem(row, now)));

  return (
    <main className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-semibold">Schnell-Update</h1>
      {items.length === 0 ? (
        <p role="status" className="py-8 text-center text-zinc-600 dark:text-zinc-400">
          Noch keine Light Novels oder E-Books.
        </p>
      ) : (
        <QuickList items={items.map(({ id, title, typeLabel, stepper, percent }) => ({ id, title, typeLabel, stepper, percent }))} />
      )}
      <p className="mt-4 text-sm">
        <Link href="/" className="underline">
          Alle Titel <span aria-hidden="true">→</span>
        </Link>
      </p>
    </main>
  );
}
