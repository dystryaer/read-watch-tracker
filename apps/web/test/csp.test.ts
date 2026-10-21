import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "../src/lib/csp";

describe("buildContentSecurityPolicy", () => {
  const policy = buildContentSecurityPolicy("abc123", { isDev: false });

  it("allows scripts only with the request nonce", () => {
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-inline' 'nonce");
  });

  it("forbids eval in production", () => {
    expect(policy).not.toContain("unsafe-eval");
  });

  it("allows eval only in development, where React needs it", () => {
    expect(buildContentSecurityPolicy("abc123", { isDev: true })).toContain("'unsafe-eval'");
  });

  it.each([
    ["default-src 'self'"],
    ["object-src 'none'"],
    ["base-uri 'self'"],
    ["form-action 'self'"],
    ["frame-ancestors 'none'"],
    ["img-src 'self' data:"],
  ])("contains %s", (directive) => {
    expect(policy).toContain(directive);
  });

  it("does not allow third-party connections", () => {
    expect(policy).toContain("connect-src 'self'");
  });

  it("upgrades insecure requests only over HTTPS", () => {
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy("abc123", { isDev: false, isHttps: true })).toContain("upgrade-insecure-requests");
  });

  it("is a single line", () => {
    expect(policy).not.toMatch(/\n/);
  });
});

describe("createNonce", () => {
  it("creates a different base64 value for every request", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a.length).toBeGreaterThanOrEqual(22);
  });
});
