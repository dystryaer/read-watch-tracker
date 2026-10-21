import "server-only";
import { type ApiContext, createApiLimiters } from "@rwt/server";
import { getDb } from "./db";

// One set of limiters per server instance (plan decision A12).
const limiters = createApiLimiters();

export async function apiContext(): Promise<ApiContext> {
  return { db: await getDb(), limiters };
}
