const MAX_LENGTH = 512;
// One leading slash, then only URL-safe characters: no "//" (protocol-relative URL), no backslash
// (browsers treat "\" like "/"), no whitespace or control characters.
const SAFE_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@/?#%]*$/;

/**
 * Where to go after login. Only same-origin paths are allowed, so `?next=` can never become an
 * open redirect; anything else, and the login page itself, falls back to "/".
 */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > MAX_LENGTH || !SAFE_PATH.test(raw)) return "/";
  if (/%0[ad]/i.test(raw)) return "/"; // encoded CR/LF
  if (/^\/login(?:[/?#]|$)/.test(raw)) return "/";
  return raw;
}
