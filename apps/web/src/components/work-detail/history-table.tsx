import type { WorkDetail } from "@rwt/server";
import { eventKindLabel, eventOutcomeLabel, formatDateTime, positionText } from "@/lib/format";

export function HistoryTable({ events }: { events: WorkDetail["events"] }) {
  if (events.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Noch keine Ereignisse.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-zinc-500 dark:text-zinc-400">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">Zeit</th>
            <th scope="col" className="py-2 pr-4 font-medium">Art</th>
            <th scope="col" className="py-2 pr-4 font-medium">Stand</th>
            <th scope="col" className="py-2 pr-4 font-medium">Quelle / Gerät</th>
            <th scope="col" className="py-2 font-medium">Ergebnis</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                <time dateTime={event.occurredAt.toISOString()}>{formatDateTime(event.occurredAt)}</time>
              </td>
              <td className="py-2 pr-4">{eventKindLabel(event.kind)}</td>
              <td className="py-2 pr-4 tabular-nums">{positionText(event)}</td>
              <td className="py-2 pr-4">{[event.sourceName, event.deviceName].filter(Boolean).join(" · ") || "Web-App"}</td>
              <td className="py-2">
                {eventOutcomeLabel(event.outcome)}
                {event.relinked ? (
                  <span className="block text-xs break-words text-zinc-600 dark:text-zinc-400">
                    Neuer Schlüssel „{event.externalKey}“ automatisch wiedererkannt
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
