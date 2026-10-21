export const MAX_URL_LENGTH = 2048;

/**
 * Returns the URL only for absolute http(s) addresses without embedded credentials.
 * Everything else (javascript:, data:, relative or protocol-relative URLs) is null,
 * so values from pages and devices can never become script links.
 */
export function parseHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return null;
  // Checked on the raw string so leading whitespace or "//host" tricks never reach the parser.
  if (!/^https?:\/\//i.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url;
}

/** Value for an `href` attribute, or undefined when the link must not be rendered. */
export function safeHref(value: string | null | undefined): string | undefined {
  return parseHttpUrl(value)?.href;
}
