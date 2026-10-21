import { describe, expect, it } from "vitest";
import { isAppBookKey, parseAsin, parseShare, parseWebnovelBookId } from "../src/share";

describe("parseWebnovelBookId", () => {
  it.each([
    ["https://www.webnovel.com/book/shadow-slave_22196546206090805", "22196546206090805"],
    ["https://www.webnovel.com/book/22196546206090805", "22196546206090805"],
    ["https://www.webnovel.com/book/shadow-slave_22196546206090805/nightmare-begins_59581367364123617", "22196546206090805"],
    ["https://m.webnovel.com/book/shadow-slave_22196546206090805?utm_source=share", "22196546206090805"],
    ["https://webnovel.com/book/lord-of-mysteries_11022733006234505", "11022733006234505"],
    ["Ich lese gerade Shadow Slave auf WebNovel: https://m.webnovel.com/book/22196546206090805 – schau mal rein", "22196546206090805"],
  ])("reads the book id from %s", (input, bookId) => {
    expect(parseWebnovelBookId(input)).toBe(bookId);
  });

  it.each([
    ["https://www.webnovel.com/"],
    ["https://www.webnovel.com/book/shadow-slave"],
    ["https://www.webnovel.com/comic/some-comic_12345678901234567"],
    ["https://webnovel.com.evil.example/book/22196546206090805"],
    ["https://evilwebnovel.com/book/22196546206090805"],
    ["javascript:alert(1)"],
    ["Shadow Slave"],
    [""],
  ])("finds no book id in %j", (input) => {
    expect(parseWebnovelBookId(input)).toBeNull();
  });
});

describe("parseAsin", () => {
  it.each([
    ["https://www.amazon.de/dp/B08FHBV4ZX", "B08FHBV4ZX"],
    ["https://www.amazon.de/Project-Hail-Mary-Andy-Weir/dp/B08FHBV4ZX/ref=sr_1_1", "B08FHBV4ZX"],
    ["https://www.amazon.com/gp/product/B08FHBV4ZX?tag=x", "B08FHBV4ZX"],
    ["https://www.amazon.co.uk/gp/aw/d/B08FHBV4ZX", "B08FHBV4ZX"],
    ["https://read.amazon.com/?asin=B08FHBV4ZX&ref_=kwl_kr_iv_rec_1", "B08FHBV4ZX"],
    ["https://read.amazon.com/kp/kshare?asin=b08fhbv4zx&id=abc", "B08FHBV4ZX"],
    ["„Project Hail Mary“ von Andy Weir https://read.amazon.com/kp/kshare?asin=B08FHBV4ZX&id=xyz", "B08FHBV4ZX"],
  ])("reads the ASIN from %s", (input, asin) => {
    expect(parseAsin(input)).toBe(asin);
  });

  it.each([
    ["https://www.amazon.de/"],
    ["https://www.amazon.de/dp/B08FHBV4Z"],
    ["https://www.amazon.de/dp/B08FHBV4ZX1"],
    ["https://amazon.de.evil.example/dp/B08FHBV4ZX"],
    ["https://a.co/d/abcdefg"],
    ["https://www.example.com/dp/B08FHBV4ZX"],
    ["B08FHBV4ZX"],
    [""],
  ])("finds no ASIN in %j", (input) => {
    expect(parseAsin(input)).toBeNull();
  });
});

describe("parseShare", () => {
  it("recognizes a WebNovel book from the shared URL or text", () => {
    expect(parseShare({ url: "https://m.webnovel.com/book/22196546206090805" })).toEqual({ source: "webnovel", externalKey: "22196546206090805" });
    expect(parseShare({ text: "Shadow Slave https://www.webnovel.com/book/shadow-slave_22196546206090805" })).toEqual({
      source: "webnovel",
      externalKey: "22196546206090805",
    });
  });

  it("recognizes a Kindle book by its ASIN", () => {
    expect(parseShare({ url: "https://read.amazon.com/kp/kshare?asin=B08FHBV4ZX" })).toEqual({ source: "kindle", externalKey: "B08FHBV4ZX" });
  });

  it("prefers the URL and falls back to the text", () => {
    expect(parseShare({ url: "https://www.example.com/x", text: "https://www.amazon.de/dp/B08FHBV4ZX" })).toEqual({
      source: "kindle",
      externalKey: "B08FHBV4ZX",
    });
  });

  it("recognizes nothing else", () => {
    expect(parseShare({ url: "https://www.example.com/book/123" })).toBeNull();
    expect(parseShare({})).toBeNull();
  });

  it("does not search unbounded input", () => {
    expect(parseShare({ text: `${"x".repeat(10_000)} https://www.amazon.de/dp/B08FHBV4ZX` })).toBeNull();
  });
});

describe("isAppBookKey", () => {
  it("accepts WebNovel book ids and Kindle ASINs in their own app only", () => {
    expect(isAppBookKey("webnovel", "22196546206090805")).toBe(true);
    expect(isAppBookKey("kindle", "B08FHBV4ZX")).toBe(true);
    expect(isAppBookKey("webnovel", "B08FHBV4ZX")).toBe(false);
    expect(isAppBookKey("kindle", "22196546206090805")).toBe(false);
  });

  it.each(["", "1234567", "123456789012345678901", "b08fhbv4zx", "B08FHBV4Z", "B08FHBV4ZX1", "2219654620609080 "])("refuses %j", (key) => {
    expect(isAppBookKey("webnovel", key) || isAppBookKey("kindle", key)).toBe(false);
  });
});

describe("trailing punctuation after a shared link", () => {
  it("is cut off however long it is", () => {
    expect(parseShare({ text: `Lies das: https://www.amazon.de/dp/B08FHBV4ZX${".".repeat(1500)}` })).toEqual({ source: "kindle", externalKey: "B08FHBV4ZX" });
    expect(parseWebnovelBookId(`(https://www.webnovel.com/book/22196546206090805).`)).toBe("22196546206090805");
  });
});
