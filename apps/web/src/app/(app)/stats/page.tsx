import { progressStats } from "@rwt/server";
import type { Metadata } from "next";
import { StatsTable } from "@/components/stats-table";
import { getAuthorizedDb } from "@/lib/dal";
import { monthLabel, weekLabel } from "@/lib/stats-format";

export const metadata: Metadata = { title: "Statistik · Read-Watch-Tracker" };

/** How much I read and watched (SPEC §4.8), per week and per month. */
export default async function StatsPage() {
  const { weeks, months } = await progressStats(await getAuthorizedDb(), new Date());

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Statistik</h1>
      <StatsTable
        caption="Pro Woche (letzte 12 Wochen)"
        rows={weeks.map((week) => ({ key: week.start, label: weekLabel(week.start), chapters: week.chapters, episodes: week.episodes }))}
      />
      <StatsTable
        caption="Pro Monat (letzte 12 Monate)"
        rows={months.map((month) => ({ key: month.month, label: monthLabel(month.month), chapters: month.chapters, episodes: month.episodes }))}
      />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Gezählt wird der Fortschritt: Ein Sprung von Kap. 1200 auf 1204 zählt 4, Zurückstellen zählt nichts. Der erste Eintrag eines Titels zählt 1.
        E-Book-Prozente fließen nicht ein.
      </p>
    </main>
  );
}
