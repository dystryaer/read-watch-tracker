// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncOnChanges } from "../src/lib/page-sync";

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "<ul></ul>";
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

const titles = () => [...document.querySelectorAll("li")].map((item) => item.textContent ?? "");
const add = (title: string) => document.querySelector("ul")?.insertAdjacentHTML("beforeend", `<li>${title}</li>`);
// MutationObserver callbacks run as microtasks; the fake clock does not run them by itself.
const settle = async (ms: number) => {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(ms);
};

describe("syncOnChanges", () => {
  it("reads the page at once and sends nothing for an empty list", () => {
    const send = vi.fn();
    stop = syncOnChanges(document, titles, send);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends again once more entries loaded and the page is quiet for a moment", async () => {
    add("Frieren");
    const send = vi.fn();
    stop = syncOnChanges(document, titles, send);
    expect(send).toHaveBeenLastCalledWith(["Frieren"]);

    add("Dandadan");
    await settle(1000);
    expect(send).toHaveBeenCalledTimes(1);
    await settle(600);
    expect(send).toHaveBeenLastCalledWith(["Frieren", "Dandadan"]);
  });

  it("does not send the same entries twice", async () => {
    add("Frieren");
    const send = vi.fn();
    stop = syncOnChanges(document, titles, send);

    document.body.insertAdjacentHTML("beforeend", "<p>Werbung</p>");
    await settle(2000);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("still reads a page that never stops changing, at least every ten seconds", async () => {
    const send = vi.fn();
    stop = syncOnChanges(document, titles, send);
    for (let second = 1; second <= 11; second++) {
      add(`Folge ${second}`);
      await settle(1000);
    }
    expect(send).toHaveBeenCalled();
  });

  it("stops watching when stopped", async () => {
    const send = vi.fn();
    stop = syncOnChanges(document, titles, send);
    stop();
    add("Frieren");
    await settle(2000);
    expect(send).not.toHaveBeenCalled();
  });
});
