/** Fresh, unguessable nonce per request (Next.js attaches it to its own scripts). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Strict nonce-based CSP: injected markup cannot run scripts even if escaping failed somewhere.
 * Inline styles stay allowed in development only, where the dev server injects them.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  { isDev, isHttps = false }: { isDev: boolean; isHttps?: boolean },
): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only over HTTPS: on http://localhost it would break the app's own assets.
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}
