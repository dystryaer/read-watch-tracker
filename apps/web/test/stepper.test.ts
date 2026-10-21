import { describe, expect, it } from "vitest";
import { stepPosition, stepperLabel } from "../src/lib/stepper";

describe("stepPosition", () => {
  it.each([
    ["chapter", 216, 1, 217],
    ["chapter", 216, -1, 215],
    ["chapter", 105.5, 1, 106],
    ["chapter", 105.5, -1, 105],
    ["chapter", 0, -1, 0],
    ["chapter", null, 1, 1],
    ["chapter", null, -1, null],
    ["chapter", 99999, 1, 99999],
    ["episode", 14, 1, 15],
    ["episode", 1, -1, 1],
    ["episode", null, 1, 1],
  ] as const)("%s %s %+d → %s", (unit, value, delta, expected) => {
    expect(stepPosition(unit, value, delta)).toBe(expected);
  });
});

describe("stepperLabel", () => {
  it.each([
    [{ unit: "chapter", value: 216, season: null }, "Kap. 216"],
    [{ unit: "chapter", value: null, season: null }, "Kap. ?"],
    [{ unit: "episode", value: 14, season: 1 }, "S1 · F14"],
    [{ unit: "episode", value: 3, season: null }, "F3"],
    [{ unit: "episode", value: null, season: null }, "F ?"],
  ] as const)("labels %j", (stepper, label) => {
    expect(stepperLabel(stepper)).toBe(label);
  });
});
