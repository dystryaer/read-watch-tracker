import { describe, expect, it, vi } from "vitest";
import type { PostEventsResult } from "../src/lib/api-client";
import { MAX_BACKOFF_MS, Outbox, OUTBOX_LIMIT } from "../src/lib/outbox";
import { createStore } from "../src/lib/storage";
import { event, fakeStorage } from "./fakes";

function setup(post: (events: { id: string }[]) => Promise<PostEventsResult>, now = { value: 0 }) {
  const area = fakeStorage();
  const onUnauthorized = vi.fn();
  const outbox = new Outbox(createStore(area), { postEvents: post }, { now: () => now.value, onUnauthorized });
  return { area, outbox, onUnauthorized, now };
}

const acceptAll = async (events: { id: string }[]): Promise<PostEventsResult> => ({
  ok: true,
  results: events.map((e, index) => ({ id: e.id, index, outcome: "applied" as const })),
});

describe("Outbox", () => {
  it("sends queued events and removes the acknowledged ones", async () => {
    const post = vi.fn(acceptAll);
    const { outbox } = setup(post);
    await outbox.enqueue(event(1));
    await outbox.enqueue(event(2));

    const result = await outbox.flush();

    expect(result).toEqual({ sent: 2, remaining: 0 });
    expect(post).toHaveBeenCalledTimes(1);
    expect((await outbox.state()).events).toEqual([]);
  });

  it("treats rejected events as done, so they are not resent forever", async () => {
    const { outbox } = setup(async (events) => ({
      ok: true,
      results: events.map((e, index) => ({ id: e.id, index, outcome: "rejected" as const, reason: "bad" })),
    }));
    await outbox.enqueue(event(1));

    await outbox.flush();

    expect((await outbox.state()).events).toEqual([]);
  });

  it("keeps events the server did not answer for", async () => {
    const kept = event(2);
    const { outbox } = setup(async (events) => ({
      ok: true,
      results: [{ id: events[0]?.id ?? null, index: 0, outcome: "applied" as const }],
    }));
    await outbox.enqueue(event(1));
    await outbox.enqueue(kept);

    await outbox.flush();

    expect((await outbox.state()).events.map((e) => e.id)).toEqual([kept.id]);
  });

  it("sends at most 100 events per request", async () => {
    const post = vi.fn(acceptAll);
    const { outbox } = setup(post);
    for (let i = 0; i < 150; i++) await outbox.enqueue(event(i));

    await outbox.flush();

    expect(post.mock.calls.map(([batch]) => batch.length)).toEqual([100, 50]);
  });

  it("backs off exponentially on errors, up to 30 minutes", async () => {
    const now = { value: 0 };
    const post = vi.fn(async (): Promise<PostEventsResult> => ({ ok: false, kind: "retry", message: "offline" }));
    const { outbox } = setup(post, now);
    await outbox.enqueue(event(1));

    await outbox.flush();
    const first = await outbox.state();
    expect(first).toMatchObject({ attempts: 1, nextAttemptAt: 30_000, lastError: "offline" });

    await outbox.flush(); // still waiting: no request
    expect(post).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 12; i++) {
      now.value = (await outbox.state()).nextAttemptAt ?? 0;
      await outbox.flush();
    }
    const last = await outbox.state();
    expect((last.nextAttemptAt ?? 0) - now.value).toBe(MAX_BACKOFF_MS);
    expect(last.events).toHaveLength(1);
  });

  it("sends at once on a manual sync, even while backing off", async () => {
    let fail = true;
    const post = vi.fn(async (events: { id: string }[]) => (fail ? { ok: false as const, kind: "retry" as const, message: "x" } : acceptAll(events)));
    const { outbox } = setup(post);
    await outbox.enqueue(event(1));
    await outbox.flush();
    fail = false;

    const result = await outbox.flush({ force: true });

    expect(result).toEqual({ sent: 1, remaining: 0 });
  });

  it("honours a Retry-After from the server", async () => {
    const { outbox } = setup(async () => ({ ok: false, kind: "retry", message: "rate limited", retryAfterMs: 60_000 }));
    await outbox.enqueue(event(1));

    await outbox.flush();

    expect((await outbox.state()).nextAttemptAt).toBe(60_000);
  });

  it("resets the backoff after a successful send", async () => {
    let fail = true;
    const now = { value: 0 };
    const { outbox } = setup(async (events) => (fail ? { ok: false, kind: "retry", message: "x" } : acceptAll(events)), now);
    await outbox.enqueue(event(1));
    await outbox.flush();
    fail = false;
    now.value = 30_000;

    await outbox.flush();

    expect(await outbox.state()).toMatchObject({ attempts: 0, nextAttemptAt: null, lastError: null, lastSyncAt: 30_000 });
  });

  it("stops and reports when the token is no longer accepted, keeping the events", async () => {
    const { outbox, onUnauthorized } = setup(async () => ({ ok: false, kind: "unauthorized", message: "401" }));
    await outbox.enqueue(event(1));

    await outbox.flush();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect((await outbox.state()).events).toHaveLength(1);
  });

  it("drops the oldest events beyond the limit and counts them", async () => {
    const full = Array.from({ length: OUTBOX_LIMIT }, (_, i) => event(i % 1000));
    const area = fakeStorage({
      outbox: { events: full, attempts: 0, nextAttemptAt: null, lastSyncAt: null, lastError: null, dropped: 0 },
    });
    const outbox = new Outbox(createStore(area), { postEvents: acceptAll }, { now: () => 0, onUnauthorized: () => {} });
    const newest = [event(1), event(2), event(3)];

    for (const e of newest) await outbox.enqueue(e);

    const state = await outbox.state();
    expect(state.events).toHaveLength(OUTBOX_LIMIT);
    expect(state.dropped).toBe(3);
    expect(state.events.slice(-3).map((e) => e.id)).toEqual(newest.map((e) => e.id));
    expect(state.events[0]?.id).toBe(full[3]?.id);
  });

  it("does not lose an event queued while a send is in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { outbox } = setup(async (events) => {
      await gate;
      return acceptAll(events);
    });
    await outbox.enqueue(event(1));

    const flushing = outbox.flush();
    const late = event(2);
    const queuing = outbox.enqueue(late);
    release();
    await Promise.all([flushing, queuing]);

    expect((await outbox.state()).events.map((e) => e.id)).toEqual([late.id]);
  });

  it("recovers from a corrupt outbox in storage", async () => {
    const area = fakeStorage({ outbox: { events: "garbage" } });
    const outbox = new Outbox(createStore(area, () => {}), { postEvents: acceptAll }, { now: () => 0, onUnauthorized: () => {} });

    await outbox.enqueue(event(1));

    expect((await outbox.state()).events).toHaveLength(1);
  });
});

describe("Outbox.enqueueMany", () => {
  it("queues many events with a single storage write", async () => {
    const { area, outbox } = setup(acceptAll);
    const writes = vi.spyOn(area, "set");

    await outbox.enqueueMany(Array.from({ length: 2000 }, (_, i) => event(i)));

    expect(writes).toHaveBeenCalledTimes(1);
    expect((await outbox.state()).events).toHaveLength(2000);
  });

  it("keeps the limit and counts what it dropped", async () => {
    const { outbox } = setup(acceptAll);
    await outbox.enqueueMany(Array.from({ length: OUTBOX_LIMIT + 3 }, (_, i) => event(i)));

    const state = await outbox.state();
    expect(state.events).toHaveLength(OUTBOX_LIMIT);
    expect(state.dropped).toBe(3);
    expect(state.events[0]?.position).toEqual({ unit: "chapter", chapter: 3 });
  });
});
