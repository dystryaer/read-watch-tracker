import "server-only";
import { RateLimiter } from "@rwt/server";

export { clientAddress } from "@rwt/server";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Per client and overall, so a distributed guess at the single account is slowed down as well.
export const loginLimiterPerClient = new RateLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES });
export const loginLimiterOverall = new RateLimiter({ limit: 100, windowMs: FIFTEEN_MINUTES });
