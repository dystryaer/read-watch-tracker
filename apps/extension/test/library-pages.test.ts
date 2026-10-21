// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { isLibraryPage, libraryServiceForUrl, MAX_LIBRARY_ENTRIES, readLibrary } from "../src/library/pages";

// Synthetic library pages (A10): unverified until samples of the real pages (Spikes S2/S3) replace them.
function page(html: string) {
  document.body.innerHTML = html;
  return document;
}

const webnovelLibrary = new URL("https://www.webnovel.com/library");
const kindleLibrary = new URL("https://read.amazon.com/kindle-library");

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("libraryServiceForUrl / isLibraryPage", () => {
  it("knows the two library pages", () => {
    expect(libraryServiceForUrl(webnovelLibrary)).toBe("webnovel");
    expect(libraryServiceForUrl(kindleLibrary)).toBe("kindle");
    expect(isLibraryPage(webnovelLibrary)).toBe(true);
    expect(isLibraryPage(new URL("https://www.webnovel.com/book/shadow-slave_22196546206090805"))).toBe(false);
    expect(isLibraryPage(new URL("https://www.amazon.de/gp/video/detail/B0ABC"))).toBe(false);
    expect(libraryServiceForUrl(new URL("https://webnovel.com.evil.example/library"))).toBeUndefined();
  });
});

describe("readLibrary – WebNovel", () => {
  it("reads book id, title and the chapter reached", () => {
    const doc = page(`<ul>
      <li class="library-item"><a href="/book/shadow-slave_22196546206090805"><h3>Shadow Slave</h3></a><span>Chapter 1204</span></li>
      <li class="library-item"><a href="https://www.webnovel.com/book/lord-of-mysteries_11022733006234505"><h3>Lord of Mysteries</h3></a><span>Kapitel 812/1430</span></li>
    </ul>`);
    expect(readLibrary(doc, webnovelLibrary)).toEqual([
      { externalKey: "22196546206090805", title: "Shadow Slave", chapter: 1204, seriesUrl: "https://www.webnovel.com/book/shadow-slave_22196546206090805" },
      { externalKey: "11022733006234505", title: "Lord of Mysteries", chapter: 812, seriesUrl: "https://www.webnovel.com/book/lord-of-mysteries_11022733006234505" },
    ]);
  });

  it("skips books without a readable chapter and links that lead elsewhere", () => {
    const doc = page(`<ul>
      <li class="library-item"><a href="/book/new-book_33333333333333333"><h3>Noch nicht begonnen</h3></a></li>
      <li class="library-item"><a href="https://evil.example/book/x_44444444444444444"><h3>Fremd</h3></a><span>Chapter 3</span></li>
    </ul>`);
    expect(readLibrary(doc, webnovelLibrary)).toEqual([]);
  });
});

describe("readLibrary – Kindle", () => {
  it("reads ASIN, title and the percentage where the page shows one", () => {
    const doc = page(`<ul>
      <li data-asin="B08FHBV4ZX"><p class="title">Project Hail Mary</p><span>43 %</span></li>
      <li data-asin="b0c1abcdef"><p class="title">Der Schwarm</p><span>Gelesen: 100%</span></li>
      <li data-asin="B0NOPROGRES"><p class="title">Ohne Stand</p></li>
    </ul>`);
    expect(readLibrary(doc, kindleLibrary)).toEqual([
      { externalKey: "B08FHBV4ZX", title: "Project Hail Mary", percent: 43, seriesUrl: null },
      { externalKey: "B0C1ABCDEF", title: "Der Schwarm", percent: 100, seriesUrl: null },
    ]);
  });
});

describe("readLibrary – limits", () => {
  it("is null outside the library pages", () => {
    expect(readLibrary(page("<p>x</p>"), new URL("https://www.webnovel.com/"))).toBeNull();
  });

  it("reads at most a bounded number of books", () => {
    const items = Array.from(
      { length: MAX_LIBRARY_ENTRIES + 20 },
      (_, i) => `<li class="library-item"><a href="/book/b_${String(10_000_000_000 + i)}"><h3>B ${i}</h3></a><span>Chapter 1</span></li>`,
    );
    expect(readLibrary(page(`<ul>${items.join("")}</ul>`), webnovelLibrary)).toHaveLength(MAX_LIBRARY_ENTRIES);
  });
});
