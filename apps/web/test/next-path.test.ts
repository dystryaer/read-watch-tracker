import { describe, expect, it } from "vitest";
import { safeNextPath } from "../src/lib/next-path";

describe("safeNextPath", () => {
  it.each([["/"], ["/inbox"], ["/pair?code=K7P3QX"], ["/works/9a86ad4e-ed0c-4ba2-b852-8f84284d6adc"], ["/settings#geraete"]])(
    "keeps the same-origin path %j",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ["//evil.example"],
    ["//evil.example/inbox"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["https://evil.example"],
    ["javascript:alert(1)"],
    ["inbox"],
    [" /inbox"],
    ["/in box"],
    ["/%0d%0aSet-Cookie:x"],
    [`/${"a".repeat(600)}`],
    [""],
    [null],
    [undefined],
  ])("falls back to / for %j", (path) => {
    expect(safeNextPath(path)).toBe("/");
  });

  it("does not send the user back to the login itself", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/inbox")).toBe("/");
  });
});
