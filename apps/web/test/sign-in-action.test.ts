import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Server Action with Next's request APIs and the auth instance replaced; the limiter is the real one.
const mocks = vi.hoisted(() => ({ signInEmail: vi.fn(), client: "10.0.0.1" }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": mocks.client }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/auth", () => ({ getAuth: async () => ({ api: { signInEmail: mocks.signInEmail } }), hasOwnerAccount: async () => true }));

const { signInAction } = await import("../src/app/(auth)/actions");

const LIMIT = 10;
let clients = 0;

function login(password = "wrong password") {
  const form = new FormData();
  form.set("email", "owner@example.test");
  form.set("password", password);
  return signInAction(null, form);
}

const wrongPassword = () => new APIError("UNAUTHORIZED", { message: "Invalid email or password" });
const slowly = <T>(result: () => T) => new Promise<T>((resolve) => setTimeout(() => resolve(result()), 20));

beforeEach(() => {
  mocks.signInEmail.mockReset();
  // Each test comes from its own address: the limiter keeps its counts for the whole file.
  mocks.client = `10.0.1.${++clients}`;
});

describe("signInAction rate limit", () => {
  it("lets no more parallel wrong guesses reach the password check than the limit", async () => {
    mocks.signInEmail.mockImplementation(() => slowly(() => Promise.reject(wrongPassword())));

    const results = await Promise.all(Array.from({ length: 40 }, () => login()));

    expect(mocks.signInEmail).toHaveBeenCalledTimes(LIMIT);
    expect(results.filter((result) => result?.error.startsWith("Zu viele")).length).toBe(40 - LIMIT);
  });

  it("does not count successful sign-ins", async () => {
    mocks.signInEmail.mockResolvedValue({});

    for (let attempt = 0; attempt < LIMIT + 5; attempt++) await expect(login("correct horse battery")).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.signInEmail).toHaveBeenCalledTimes(LIMIT + 5);
  });

  it("gives the slot back when the check fails for another reason than the password", async () => {
    mocks.signInEmail.mockRejectedValue(new Error("database down"));
    for (let attempt = 0; attempt < LIMIT + 2; attempt++) await expect(login()).rejects.toThrow("database down");

    mocks.signInEmail.mockRejectedValue(wrongPassword());
    expect(await login()).toEqual({ error: "E-Mail-Adresse oder Passwort ist falsch." });
  });

  it("blocks further guesses after the limit of wrong passwords", async () => {
    mocks.signInEmail.mockRejectedValue(wrongPassword());
    for (let attempt = 0; attempt < LIMIT; attempt++) await login();

    expect(await login()).toEqual({ error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." });
    expect(mocks.signInEmail).toHaveBeenCalledTimes(LIMIT);
  });
});
