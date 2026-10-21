import { countOpenPending, listOverview } from "@rwt/server";
import { OverviewScreen } from "@/components/overview/overview-screen";
import { getDb } from "@/lib/db";
import { toOverviewItem } from "@/lib/overview";

export default async function HomePage() {
  const db = await getDb();
  const [rows, pendingCount] = await Promise.all([listOverview(db), countOpenPending(db)]);
  const now = new Date();
  // Labels and links are built on the server; only plain strings reach the browser.
  const items = rows.map((row) => toOverviewItem(row, now));
  return <OverviewScreen items={items} pendingCount={pendingCount} />;
}
