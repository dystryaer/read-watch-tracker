import { countOpenPending, listOverview, webnovelSyncStatus } from "@rwt/server";
import { OverviewScreen } from "@/components/overview/overview-screen";
import { getAuthorizedDb } from "@/lib/dal";
import { toOverviewItem, webnovelReminder } from "@/lib/overview";

export default async function HomePage() {
  const db = await getAuthorizedDb();
  const [rows, pendingCount, webnovel] = await Promise.all([listOverview(db), countOpenPending(db), webnovelSyncStatus(db)]);
  const now = new Date();
  // Labels and links are built on the server; only plain strings reach the browser.
  const items = rows.map((row) => toOverviewItem(row, now));
  return <OverviewScreen items={items} pendingCount={pendingCount} webnovelHint={webnovelReminder(webnovel, now)} />;
}
