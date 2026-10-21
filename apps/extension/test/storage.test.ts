import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createStore } from "../src/lib/storage";
import { fakeStorage } from "./fakes";

const Schema = z.object({ count: z.number().int() });

describe("createStore", () => {
  it("returns the fallback for a missing entry", async () => {
    const store = createStore(fakeStorage());
    expect(await store.read("x", Schema, { count: 0 })).toEqual({ count: 0 });
  });

  it("reads back what was written", async () => {
    const store = createStore(fakeStorage());
    await store.write("x", { count: 3 });
    expect(await store.read("x", Schema, { count: 0 })).toEqual({ count: 3 });
  });

  it("discards a corrupt entry, warns and returns the fallback", async () => {
    const area = fakeStorage({ x: { count: "three" } });
    const warn = vi.fn();
    const store = createStore(area, warn);

    expect(await store.read("x", Schema, { count: 0 })).toEqual({ count: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"x"'));
    expect(area.data).not.toHaveProperty("x");
  });

  it("strips unexpected fields that were planted in storage", async () => {
    const store = createStore(fakeStorage({ x: { count: 1, injected: "<script>" } }));
    expect(await store.read("x", Schema, { count: 0 })).toEqual({ count: 1 });
  });
});
