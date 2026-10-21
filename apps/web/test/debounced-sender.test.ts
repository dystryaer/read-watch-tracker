import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebouncedSender } from "../src/lib/debounced-sender";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("DebouncedSender", () => {
  it("sends once, 500 ms after the last of quick changes", () => {
    const send = vi.fn();
    const sender = new DebouncedSender(send);

    sender.schedule();
    vi.advanceTimersByTime(400);
    sender.schedule();
    vi.advanceTimersByTime(499);
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends a waiting change at once on flush, and only once", () => {
    const send = vi.fn();
    const sender = new DebouncedSender(send);
    sender.schedule();

    sender.flush();
    vi.advanceTimersByTime(1000);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends nothing on flush when nothing is waiting", () => {
    const send = vi.fn();
    const sender = new DebouncedSender(send);

    sender.flush();
    sender.schedule();
    vi.advanceTimersByTime(500);
    sender.flush();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("knows whether a change is waiting", () => {
    const sender = new DebouncedSender(() => {});
    expect(sender.waiting).toBe(false);
    sender.schedule();
    expect(sender.waiting).toBe(true);
    vi.advanceTimersByTime(500);
    expect(sender.waiting).toBe(false);
  });
});
