import "server-only";
import { fillSiteCovers } from "@rwt/server";
import { after } from "next/server";
import { getDb } from "./db";

// One run at a time: events arrive in bursts, and each run already takes the next waiting works.
let running: Promise<unknown> | null = null;

/** After the response is sent: downloads the site pictures that new events or confirmations named. */
export function fillCoversLater(): void {
  after(async () => {
    if (running) return;
    running = getDb()
      .then((db) => fillSiteCovers(db))
      .catch((error: unknown) => console.error("Bilder der Seiten konnten nicht geladen werden:", error))
      .finally(() => {
        running = null;
      });
    await running;
  });
}
