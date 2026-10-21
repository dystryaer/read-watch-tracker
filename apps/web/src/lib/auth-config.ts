import { authAccount, authSession, authUser, authVerification, type Db } from "@rwt/db";
import { hasOwner } from "@rwt/server";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

export { hasOwner };

/**
 * Single-user login (SPEC §11). Registration is possible only while no account exists; the
 * database's single-owner index backs this up. No HTTP routes are mounted: the app calls
 * `auth.api` from Server Actions, so there is no public sign-up endpoint at all.
 */
export function createAuth(
  db: Db,
  { secret, baseURL, plugins = [] }: { secret: string; baseURL: string; plugins?: BetterAuthPlugin[] },
) {
  return betterAuth({
    secret,
    baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: true,
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    telemetry: { enabled: false },
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            if (await hasOwner(db)) throw new APIError("FORBIDDEN", { message: "Registration is closed" });
          },
        },
      },
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
