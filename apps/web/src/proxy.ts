import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy, createNonce } from "./lib/csp";

const PUBLIC_PATHS = new Set(["/login", "/setup"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Optimistic check, also for prefetches: without a session cookie nothing behind the login is
  // rendered at all. The authoritative check runs at the data source (getAuthorizedDb).
  if (!PUBLIC_PATHS.has(pathname) && !getSessionCookie(request)) {
    const login = new URL("/login", request.url);
    const next = `${pathname}${search}`;
    if (next !== "/") login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  // Prefetch payloads contain no script tags, so they need no nonce.
  if (request.headers.get("next-router-prefetch") || request.headers.get("purpose") === "prefetch") {
    return NextResponse.next();
  }

  const nonce = createNonce();
  const policy = buildContentSecurityPolicy(nonce, {
    isDev: process.env.NODE_ENV === "development",
    isHttps: request.nextUrl.protocol === "https:",
  });

  // Next.js reads the nonce from the request's CSP header while rendering.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  // Lets the login send the user back to where they were (validated by safeNextPath).
  requestHeaders.set("x-pathname", `${pathname}${search}`);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Manifest and app icons are fetched without a session (install prompt, iOS home screen).
  matcher: ["/((?!api/|_next/static/|_next/image/|favicon.ico|icons/|manifest.webmanifest|icon$|apple-icon$).*)"],
};
