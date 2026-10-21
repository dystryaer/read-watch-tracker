import { z } from "zod";
import type { Store } from "./storage";

const WINDOW_MS = 12 * 60 * 60 * 1000;
const KEY = "recent";
const Recent = z.record(z.string().max(700), z.number());

/** At most one event per series and chapter in 12 hours (SPEC §7.4). */
export class RecentReads {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: Store) {}

  /** True if `key` was not sent in the last 12 hours; records it as sent. */
  async claim(key: string, now = Date.now()): Promise<boolean> {
    return (await this.claimMany([key], now)).has(key);
  }

  /** The keys not sent in the last 12 hours, all recorded as sent with one storage write. */
  claimMany(keys: string[], now = Date.now()): Promise<Set<string>> {
    const run = this.chain.then(async () => {
      const recent = Object.fromEntries(
        Object.entries(await this.store.read(KEY, Recent, {})).filter(([, at]) => now - at < WINDOW_MS),
      );
      const fresh = new Set(keys.filter((key) => recent[key] === undefined));
      for (const key of fresh) recent[key] = now;
      await this.store.write(KEY, recent);
      return fresh;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
