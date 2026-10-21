import "server-only";
import { RateLimiter } from "./rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Per client and overall, so a distributed guess at the single account is slowed down as well.
export const loginLimiterPerClient = new RateLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES });
export const loginLimiterOverall = new RateLimiter({ limit: 100, windowMs: FIFTEEN_MINUTES });

/** Client address behind a proxy such as Vercel; only used as a rate-limit key. */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
