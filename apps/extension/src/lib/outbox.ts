import { ProgressEvent } from "@rwt/core";
import { z } from "zod";
import type { PostEventsResult } from "./api-client";
import type { Store } from "./storage";

export const OUTBOX_LIMIT = 5000;
export const MAX_BACKOFF_MS = 30 * 60_000;
const FIRST_BACKOFF_MS = 30_000;
const BATCH_SIZE = 100;
const KEY = "outbox";

export interface OutboxState {
  events: ProgressEvent[];
  attempts: number;
  nextAttemptAt: number | null;
  lastSyncAt: number | null;
  lastError: string | null;
  dropped: number;
}

// Events are validated one by one, so a single damaged entry does not cost the whole queue.
const StoredOutbox = z.object({
  events: z.array(z.unknown()).max(OUTBOX_LIMIT * 2),
  attempts: z.number().int().min(0).max(1000),
  nextAttemptAt: z.number().nullable(),
  lastSyncAt: z.number().nullable(),
  lastError: z.string().max(500).nullable(),
  dropped: z.number().int().min(0),
});

const EMPTY: z.infer<typeof StoredOutbox> = { events: [], attempts: 0, nextAttemptAt: null, lastSyncAt: null, lastError: null, dropped: 0 };

export const backoffMs = (attempts: number) => Math.min(FIRST_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);

/**
 * Events wait here until the server has acknowledged them (SPEC §7.7). Every event carries its
 * UUID, so resending after a lost response is harmless. All changes are serialized, which keeps an
 * event queued during a send from being overwritten.
 */
export class Outbox {
  private cached: OutboxState | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: Store,
    private readonly api: { postEvents(events: ProgressEvent[]): Promise<PostEventsResult> },
    private readonly options: { now: () => number; onUnauthorized: () => void },
  ) {}

  state(): Promise<OutboxState> {
    return this.exclusive(async () => structuredClone(await this.load()));
  }

  enqueue(event: ProgressEvent): Promise<void> {
    return this.exclusive(async () => {
      const state = await this.load();
      state.events.push(event);
      const overflow = state.events.length - OUTBOX_LIMIT;
      if (overflow > 0) {
        state.events.splice(0, overflow);
        state.dropped += overflow;
      }
      await this.save(state);
    });
  }

  flush(): Promise<{ sent: number; remaining: number }> {
    return this.exclusive(async () => {
      const state = await this.load();
      const now = this.options.now();
      if (state.events.length === 0 || (state.nextAttemptAt !== null && state.nextAttemptAt > now)) {
        return { sent: 0, remaining: state.events.length };
      }

      let sent = 0;
      while (state.events.length > 0) {
        const batch = state.events.slice(0, BATCH_SIZE);
        const result = await this.api.postEvents(batch);
        if (!result.ok) {
          state.lastError = result.message;
          if (result.kind === "unauthorized") {
            await this.save(state);
            this.options.onUnauthorized();
          } else {
            state.attempts += 1;
            state.nextAttemptAt = now + (result.retryAfterMs ?? backoffMs(state.attempts));
            await this.save(state);
          }
          return { sent, remaining: state.events.length };
        }

        // Every answered event is final, including "rejected": resending it would never succeed.
        const answered = new Set(result.results.flatMap((entry) => (entry.id ? [entry.id] : [])));
        const before = state.events.length;
        state.events = state.events.filter((event) => !answered.has(event.id));
        const acknowledged = before - state.events.length;
        sent += acknowledged;
        if (acknowledged < batch.length) break; // unanswered events wait for the next flush
      }

      state.attempts = 0;
      state.nextAttemptAt = null;
      state.lastError = null;
      state.lastSyncAt = now;
      await this.save(state);
      return { sent, remaining: state.events.length };
    });
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<OutboxState> {
    if (this.cached) return this.cached;
    const stored = await this.store.read(KEY, StoredOutbox, EMPTY);
    const events = stored.events.flatMap((raw) => {
      const parsed = ProgressEvent.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    });
    this.cached = { ...stored, events: events.slice(-OUTBOX_LIMIT) };
    return this.cached;
  }

  private async save(state: OutboxState): Promise<void> {
    this.cached = state;
    await this.store.write(KEY, state);
  }
}

/** Read-only summary for the options page; the background's Outbox instance stays the only writer. */
export async function readOutboxSummary(store: Store): Promise<Pick<OutboxState, "lastSyncAt" | "lastError" | "dropped"> & { queued: number }> {
  const stored = await store.read(KEY, StoredOutbox, EMPTY);
  return { queued: stored.events.length, lastSyncAt: stored.lastSyncAt, lastError: stored.lastError, dropped: stored.dropped };
}
