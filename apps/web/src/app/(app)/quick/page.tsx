import { listOverview } from "@rwt/server";
import type { Metadata } from "next";
import Link from "next/link";
import { PercentControl } from "@/components/overview/percent-control";
import { PositionStepper } from "@/components/overview/position-stepper";
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
        <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/works/${item.id}`} className="min-w-0 truncate font-medium hover:underline">
                  {item.title}
                </Link>
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{item.typeLabel}</span>
              </div>
              <div className="flex justify-center">
                {item.stepper ? (
                  <PositionStepper key={item.id} workId={item.id} initial={item.stepper} />
                ) : (
                  <PercentControl key={item.id} workId={item.id} title={item.title} initial={item.percent} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm">
        <Link href="/" className="underline">
          Alle Titel <span aria-hidden="true">→</span>
        </Link>
      </p>
    </main>
  );
}
