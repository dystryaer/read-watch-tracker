import { countOpenPending, listOverview, webnovelSyncStatus } from "@rwt/server";
import { cookies } from "next/headers";
import { OverviewScreen } from "@/components/overview/overview-screen";
import { getAuthorizedDb } from "@/lib/dal";
import { toOverviewItem, webnovelReminder } from "@/lib/overview";
import { parseOverviewView, VIEW_COOKIE } from "@/lib/shelf";

export default async function HomePage() {
  const db = await getAuthorizedDb();
  const [rows, pendingCount, webnovel, cookieStore] = await Promise.all([
    listOverview(db),
    countOpenPending(db),
    webnovelSyncStatus(db),
    cookies(),
  ]);
  const now = new Date();
  // Labels and links are built on the server; only plain strings reach the browser.
  const items = rows.map((row) => toOverviewItem(row, now));
  return (
    <OverviewScreen
      items={items}
      pendingCount={pendingCount}
      webnovelHint={webnovelReminder(webnovel, now)}
      initialView={parseOverviewView(cookieStore.get(VIEW_COOKIE)?.value)}
    />
  );
}
