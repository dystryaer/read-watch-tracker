import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_SETUP_TOKEN_LENGTH = 16;

/**
 * Who may create the one account. On a fresh deployment an open /setup would let whoever comes
 * first take the tracker, so production requires SETUP_TOKEN from the server environment.
 */
export function setupGate(env: { SETUP_TOKEN?: string; NODE_ENV?: string }): "token" | "open" | "disabled" {
  const token = env.SETUP_TOKEN ?? "";
  if (token.length >= MIN_SETUP_TOKEN_LENGTH) return "token";
  if (token !== "") return "disabled";
  return env.NODE_ENV === "production" ? "disabled" : "open";
}

/** Constant-time comparison; hashing first makes the lengths equal. */
export function setupTokenMatches(given: unknown, expected: string): boolean {
  if (typeof given !== "string") return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
