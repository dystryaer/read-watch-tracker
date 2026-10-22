"use client";

import Link from "next/link";
import { useState } from "react";
import { CoverThumb } from "@/components/cover-thumb";
import { keepOrder, type OverviewItem } from "@/lib/overview";
import { PercentControl } from "./percent-control";
import { PositionStepper } from "./position-stepper";

export type QuickItem = Pick<OverviewItem, "id" | "title" | "typeLabel" | "cover" | "stepper" | "percent">;

/**
 * The quick-update list (SPEC §9.3). Saving re-sorts the server's list by recency; the rows keep
 * the order the page opened with, so the next tap lands on the same title.
 */
export function QuickList({ items }: { items: QuickItem[] }) {
  const [order] = useState(() => items.map((item) => item.id));

  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {keepOrder(order, items).map((item) => (
        <li key={item.id} className="flex flex-col gap-2 px-3 py-3">
          <div className="flex items-center gap-3">
            <CoverThumb src={item.cover} title={item.title} />
            <Link href={`/works/${item.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
              {item.title}
            </Link>
            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{item.typeLabel}</span>
          </div>
          <div className="flex justify-center">
            {item.stepper ? (
              <PositionStepper workId={item.id} title={item.title} initial={item.stepper} />
            ) : (
              <PercentControl workId={item.id} title={item.title} initial={item.percent} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
