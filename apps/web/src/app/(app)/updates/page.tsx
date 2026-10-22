import { lastSeriesCheck, listOverview } from "@rwt/server";
import type { Metadata } from "next";
import { UpdatesScreen } from "@/components/updates/updates-screen";
import { getAuthorizedDb } from "@/lib/dal";
import { lastCheckLabel, toUpdateItem } from "@/lib/updates";
import { UPDATES_PAGE } from "@/lib/updates-page";

export const metadata: Metadata = { title: `${UPDATES_PAGE.label} · Read-Watch-Tracker` };

/** Where new chapters wait (SPEC §4.9): Manga, Manhwa and Manhua as covers, new chapters on top. */
export default async function UpdatesPage() {
  const db = await getAuthorizedDb();
  const [rows, checkedAt] = await Promise.all([listOverview(db), lastSeriesCheck(db)]);
  const now = new Date();
  // Selected and labelled on the server: only the shown works reach the browser, as plain strings.
  const items = rows.flatMap((row) => toUpdateItem(row, now) ?? []);
  return <UpdatesScreen items={items} lastCheck={lastCheckLabel(checkedAt, now)} />;
}
