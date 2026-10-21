type EventKind = "read" | "watched" | "library_sync" | "backfill" | "manual";
type EventOutcome = "applied" | "no_change" | "pending" | "ignored" | "rejected";

const KIND_LABELS: Record<EventKind, string> = {
  read: "Gelesen",
  watched: "Gesehen",
  library_sync: "Bibliothek",
  backfill: "Verlauf",
  manual: "Manuell",
};

const OUTCOME_LABELS: Record<EventOutcome, string> = {
  applied: "übernommen",
  no_change: "keine Änderung",
  pending: "wartet auf Zuordnung",
  ignored: "ignoriert",
  rejected: "abgelehnt",
};

const percentFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
// Rendered on the server, whose zone (UTC on Vercel) is not the reader's.
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: process.env.APP_TIME_ZONE ?? "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const eventKindLabel = (kind: EventKind) => KIND_LABELS[kind];
export const eventOutcomeLabel = (outcome: EventOutcome) => OUTCOME_LABELS[outcome];
export const formatDateTime = (date: Date) => dateTimeFormat.format(date);

/** Short relative age for recent moments, e.g. when a pairing code was requested. */
export function formatAge(date: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return minutes === 1 ? "vor 1 Minute" : `vor ${minutes} Minuten`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "vor 1 Stunde" : `vor ${hours} Stunden`;
}

export function positionText(columns: {
  chapter: number | null;
  season: number | null;
  episode: number | null;
  percent: number | null;
}): string {
  if (columns.chapter !== null) return `Kap. ${columns.chapter}`;
  if (columns.episode !== null) {
    return columns.season === null ? `F${columns.episode}` : `S${columns.season} · F${columns.episode}`;
  }
  if (columns.percent !== null) return `${percentFormat.format(columns.percent)} %`;
  return "–";
}
