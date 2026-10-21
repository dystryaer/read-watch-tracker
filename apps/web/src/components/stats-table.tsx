import { barWidthClass } from "@/lib/stats-format";

export interface StatsRow {
  key: string;
  label: string;
  chapters: number;
  episodes: number;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-right tabular-nums">{value}</span>
      <div aria-hidden="true" className="h-2 min-w-0 flex-1">
        <div className={`h-2 rounded-sm ${color} ${barWidthClass(value, max)}`} />
      </div>
    </div>
  );
}

/** Chapters and episodes per period (SPEC §4.8): the numbers are the content, the bars only decoration. */
export function StatsTable({ caption, rows }: { caption: string; rows: StatsRow[] }) {
  const maxChapters = Math.max(0, ...rows.map((row) => row.chapters));
  const maxEpisodes = Math.max(0, ...rows.map((row) => row.episodes));
  return (
    <table className="w-full table-fixed text-sm">
      <caption className="mb-2 text-left text-lg font-medium">{caption}</caption>
      <thead>
        <tr className="text-left text-zinc-500 dark:text-zinc-400">
          <th scope="col" className="w-32 py-1 font-normal">
            Zeitraum
          </th>
          <th scope="col" className="py-1 font-normal">
            Kapitel
          </th>
          <th scope="col" className="py-1 font-normal">
            Folgen
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-zinc-200 dark:border-zinc-800">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal whitespace-nowrap">
              {row.label}
            </th>
            <td className="py-1.5 pr-3">
              <Bar value={row.chapters} max={maxChapters} color="bg-teal-600" />
            </td>
            <td className="py-1.5">
              <Bar value={row.episodes} max={maxEpisodes} color="bg-amber-500" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
