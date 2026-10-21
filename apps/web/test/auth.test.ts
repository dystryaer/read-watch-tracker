import { authUser, type DbHandle } from "@rwt/db";
import { createTestDb, resetDb } from "@rwt/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuth, hasOwner } from "../src/lib/auth-config";

let handle: DbHandle;
const owner = { name: "Owner", email: "owner@example.test", password: "correct horse battery" };

beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle?.close();
});
beforeEach(async () => {
  await resetDb(handle.db);
});

function auth() {
  return createAuth(handle.db, { secret: "test-secret-test-secret-test-secret!", baseURL: "http://localhost:3000" });
}

describe("single-user auth", () => {
  it("lets the first account register", async () => {
    await expect(auth().api.signUpEmail({ body: owner })).resolves.toMatchObject({ user: { email: owner.email } });
    expect(await hasOwner(handle.db)).toBe(true);
  });

  it("refuses a second registration", async () => {
    await auth().api.signUpEmail({ body: owner });

    await expect(
      auth().api.signUpEmail({ body: { name: "Intruder", email: "intruder@example.test", password: "another long password" } }),
    ).rejects.toThrow();
    expect(await handle.db.select().from(authUser)).toHaveLength(1);
  });

  it("refuses a second account at the database level too", async () => {
    await auth().api.signUpEmail({ body: owner });
    const now = new Date();
    await expect(
      handle.db.insert(authUser).values({ id: "x", name: "x", email: "x@example.test", createdAt: now, updatedAt: now }),
    ).rejects.toThrow();
  });

  it("rejects passwords shorter than 12 characters", async () => {
    await expect(auth().api.signUpEmail({ body: { ...owner, password: "short-pass" } })).rejects.toThrow();
  });

  it("signs in with the right password", async () => {
    await auth().api.signUpEmail({ body: owner });
    await expect(auth().api.signInEmail({ body: { email: owner.email, password: owner.password } })).resolves.toMatchObject({
      user: { email: owner.email },
    });
  });

  it("rejects a wrong password", async () => {
    await auth().api.signUpEmail({ body: owner });
    await expect(auth().api.signInEmail({ body: { email: owner.email, password: "wrong password!!" } })).rejects.toThrow();
  });

  it("reports no owner before setup", async () => {
    expect(await hasOwner(handle.db)).toBe(false);
  });
});
