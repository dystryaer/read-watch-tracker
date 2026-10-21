import { describe, expect, it } from "vitest";
import { MIN_SETUP_TOKEN_LENGTH, setupGate, setupTokenMatches } from "../src/lib/setup-token";

const TOKEN = "a-long-setup-token-0123";

describe("setupGate", () => {
  it("asks for the token whenever SETUP_TOKEN is set", () => {
    expect(setupGate({ SETUP_TOKEN: TOKEN, NODE_ENV: "production" })).toBe("token");
    expect(setupGate({ SETUP_TOKEN: TOKEN, NODE_ENV: "development" })).toBe("token");
  });

  it("stays open without a token only outside production", () => {
    expect(setupGate({ NODE_ENV: "development" })).toBe("open");
    expect(setupGate({ NODE_ENV: "test" })).toBe("open");
  });

  it("is closed in production without a token, so the first visitor cannot take the account", () => {
    expect(setupGate({ NODE_ENV: "production" })).toBe("disabled");
    expect(setupGate({ NODE_ENV: "production", SETUP_TOKEN: "" })).toBe("disabled");
  });

  it("is closed when the token is too short to resist guessing", () => {
    expect(setupGate({ NODE_ENV: "development", SETUP_TOKEN: "x".repeat(MIN_SETUP_TOKEN_LENGTH - 1) })).toBe("disabled");
    expect(setupGate({ NODE_ENV: "production", SETUP_TOKEN: "x".repeat(MIN_SETUP_TOKEN_LENGTH) })).toBe("token");
  });
});

describe("setupTokenMatches", () => {
  it("accepts the exact token", () => {
    expect(setupTokenMatches(TOKEN, TOKEN)).toBe(true);
  });

  it.each([[""], [`${TOKEN} `], [TOKEN.toUpperCase()], [TOKEN.slice(0, -1)], [null], [42]])(
    "rejects %j",
    (given) => {
      expect(setupTokenMatches(given, TOKEN)).toBe(false);
    },
  );
});
