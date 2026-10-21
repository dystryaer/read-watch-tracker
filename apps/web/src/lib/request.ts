import "server-only";
import { RateLimiter } from "@rwt/server";

export { clientAddress } from "@rwt/server";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Per client address only: a global bucket would let anyone lock the owner out by failing on purpose.
export const loginLimiterPerClient = new RateLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES });
