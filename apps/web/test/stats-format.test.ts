import { describe, expect, it } from "vitest";
import { barWidthClass, monthLabel, weekLabel } from "../src/lib/stats-format";

describe("stats labels", () => {
  it("names a week by its Monday and Sunday", () => {
    expect(weekLabel("2026-10-26")).toBe("26.10.–1.11.");
    expect(weekLabel("2026-12-28")).toBe("28.12.–3.1.");
  });

  it("names a month in German", () => {
    expect(monthLabel("2026-10")).toBe("Oktober 2026");
    expect(monthLabel("2026-03")).toBe("März 2026");
  });
});

describe("barWidthClass", () => {
  it("scales to the largest value in 5 % steps, and a small value still shows", () => {
    expect(barWidthClass(0, 40)).toBe("w-0");
    expect(barWidthClass(40, 40)).toBe("w-full");
    expect(barWidthClass(20, 40)).toBe("w-[50%]");
    expect(barWidthClass(1, 400)).toBe("w-[5%]");
    expect(barWidthClass(3, 0)).toBe("w-0");
  });
});
