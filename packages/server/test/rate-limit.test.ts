import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/http/rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit within the window", () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 1000 });
    expect([1, 2, 3].map(() => limiter.allow("k", 0))).toEqual([true, true, true]);
    expect(limiter.allow("k", 10)).toBe(false);
  });

  it("allows again once old hits leave the window", () => {
    const limiter = new RateLimiter({ limit: 2, windowMs: 1000 });
    limiter.allow("k", 0);
    limiter.allow("k", 500);
    expect(limiter.allow("k", 999)).toBe(false);
    expect(limiter.allow("k", 1001)).toBe(true);
  });

  it("counts keys separately", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(false);
  });

  it("does not count refused attempts", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });
    limiter.allow("k", 0);
    for (let t = 1; t < 900; t += 100) limiter.allow("k", t);
    expect(limiter.allow("k", 1000)).toBe(true);
  });

  it("forgets idle keys so memory stays bounded", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    limiter.allow("a", 0);
    limiter.allow("b", 0);
    limiter.allow("c", 5000);
    expect(limiter.size).toBeLessThanOrEqual(2);
  });
});
