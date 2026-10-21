import { describe, expect, it } from "vitest";
import { clientAddress } from "../src/http/request";

const headers = (values: Record<string, string>) => new Headers(values);

describe("clientAddress", () => {
  it("takes the entry added by the trusted proxy, not one the client could prepend", () => {
    // A client sends "X-Forwarded-For: 1.1.1.1"; nginx appends the real address.
    expect(clientAddress(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }), 1)).toBe("203.0.113.7");
  });

  it("counts proxy hops from the right", () => {
    expect(clientAddress(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.2" }), 2)).toBe("203.0.113.7");
  });

  it("uses the single entry a platform like Vercel sets", () => {
    expect(clientAddress(headers({ "x-forwarded-for": "203.0.113.7" }), 1)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip and then to a constant", () => {
    expect(clientAddress(headers({ "x-real-ip": "203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientAddress(headers({}), 1)).toBe("unknown");
  });

  it("falls back when there are fewer entries than hops", () => {
    expect(clientAddress(headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.9" }), 2)).toBe("203.0.113.9");
  });
});
