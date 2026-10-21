import "server-only";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { type Auth, createAuth, hasOwner } from "./auth-config";
import { getDb } from "./db";

declare global {
  var rwtAuth: Promise<Auth> | undefined;
}

export function getAuth(): Promise<Auth> {
  globalThis.rwtAuth ??= init();
  return globalThis.rwtAuth;
}

async function init(): Promise<Auth> {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  const baseURL = process.env.BETTER_AUTH_URL ?? "";
  if (secret.length < 32) throw new Error("BETTER_AUTH_SECRET must be set to at least 32 random characters");
  if (!baseURL) throw new Error("BETTER_AUTH_URL must be set (e.g. http://localhost:3000)");
  // nextCookies lets Server Actions set the session cookie.
  return createAuth(await getDb(), { secret, baseURL, plugins: [nextCookies()] });
}

// `connection()` first: these depend on the request and the database, so the route must never be
// prerendered at build time (where neither exists).
export async function hasOwnerAccount(): Promise<boolean> {
  await connection();
  return hasOwner(await getDb());
}

export async function getSession() {
  await connection();
  const requestHeaders = await headers();
  return (await getAuth()).api.getSession({ headers: requestHeaders });
}

/** Guard for every page and Server Action of the app (Server Actions are public POST endpoints). */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
