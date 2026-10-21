/**
 * Sliding-window limiter kept in memory. Good enough for a single user; on serverless hosts each
 * instance counts on its own (plan decision A12).
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  get size(): number {
    return this.hits.size;
  }

  /** Records the attempt and returns true when it is within the limit; refused attempts are not counted. */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.delete(key); // re-insert so Map order stays "least recently used first"
    this.hits.set(key, recent);
    this.evictOldest();
    return true;
  }

  private evictOldest(): void {
    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) return;
      this.hits.delete(key);
    }
  }
}
