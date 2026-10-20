import { describe, expect, it } from "vitest";
import { normalizeTitle } from "../src/normalize";

describe("normalizeTitle", () => {
  describe("case and whitespace", () => {
    it("lowercases and trims", () => {
      expect(normalizeTitle("  Solo Leveling  ")).toBe("solo leveling");
    });

    it("collapses tabs, newlines and repeated spaces into one space", () => {
      expect(normalizeTitle("Solo \t\n  Leveling")).toBe("solo leveling");
    });

    it("treats non-breaking and ideographic spaces as ordinary spaces", () => {
      expect(normalizeTitle("Solo\u00A0Leveling")).toBe("solo leveling");
      expect(normalizeTitle("Solo\u3000Leveling")).toBe("solo leveling");
    });

    it("returns an empty string for empty or whitespace-only input", () => {
      expect(normalizeTitle("")).toBe("");
      expect(normalizeTitle("   \t ")).toBe("");
    });

    it("returns an empty string for punctuation-only input", () => {
      expect(normalizeTitle("?!…")).toBe("");
    });
  });

  describe("apostrophes", () => {
    it.each([
      ["Swordmaster’s Youngest Son"], // typographic, as in the Excel list
      ["Swordmaster's Youngest Son"], // ASCII
      ["Swordmaster‘s Youngest Son"],
      ["Swordmaster´s Youngest Son"],
      ["Swordmaster`s Youngest Son"],
      ["Swordmasterʼs Youngest Son"], // U+02BC modifier letter apostrophe
      ["Swordmaster＇s Youngest Son"], // fullwidth
      ["Swordmasters Youngest Son"], // sites that drop the apostrophe
    ])("removes the apostrophe in %j without splitting the word", (title) => {
      expect(normalizeTitle(title)).toBe("swordmasters youngest son");
    });

    it("handles several apostrophes plus trailing punctuation", () => {
      expect(normalizeTitle("The Lord’s Coins Aren’t Decreasing?!")).toBe(
        "the lords coins arent decreasing",
      );
    });
  });

  describe("dashes and punctuation", () => {
    it.each([
      ["Warrior High School – Dungeon Raid Department"], // en dash, as in the Excel list
      ["Warrior High School — Dungeon Raid Department"], // em dash
      ["Warrior High School - Dungeon Raid Department"],
      ["Warrior High School: Dungeon Raid Department"],
    ])("turns the separator in %j into a single space", (title) => {
      expect(normalizeTitle(title)).toBe("warrior high school dungeon raid department");
    });

    it("splits hyphenated words", () => {
      expect(normalizeTitle("SSS-Rank Lone Summoner")).toBe("sss rank lone summoner");
    });

    it("treats a colon with or without a following space the same", () => {
      expect(normalizeTitle("Re:Life Player")).toBe("re life player");
      expect(normalizeTitle("Re: Life Player")).toBe("re life player");
    });

    it("drops commas, question marks and quotes", () => {
      expect(normalizeTitle("Star Instructor, Master Baek")).toBe("star instructor master baek");
      expect(normalizeTitle("Is this Hero for Real?")).toBe("is this hero for real");
      expect(normalizeTitle("“Hero” Returns")).toBe("hero returns");
    });

    it("removes brackets around a title that is entirely bracketed", () => {
      expect(normalizeTitle("[Oshi no Ko]")).toBe("oshi no ko");
    });
  });

  describe("numbers", () => {
    it.each([
      ["Player Who Returned 10,000 Years Later"], // as in the Excel list
      ["Player Who Returned 10.000 Years Later"], // German grouping
      ["Player Who Returned 10000 Years Later"],
    ])("joins digit groups in %j", (title) => {
      expect(normalizeTitle(title)).toBe("player who returned 10000 years later");
    });

    it("keeps numbers that are separated by a comma and a space apart", () => {
      expect(normalizeTitle("Volumes 1, 2")).toBe("volumes 1 2");
    });

    it("keeps ordinals intact", () => {
      expect(normalizeTitle("The 100th Regression of the Max-Level Player")).toBe(
        "the 100th regression of the max level player",
      );
    });
  });

  describe("noise suffixes", () => {
    it.each([
      ["Solo Leveling (Manhwa)"],
      ["Solo Leveling (manga)"],
      ["Solo Leveling (Manhua)"],
      ["Solo Leveling (Webtoon)"],
      ["Solo Leveling [Official]"],
      ["Solo Leveling (Remastered)"],
      ["Solo Leveling (German Dub)"],
      ["Solo Leveling (English Dub)"],
      ["Solo Leveling (Dub)"],
      ["Solo Leveling ( manhwa )"],
      ["Solo Leveling (German  Dub)"],
    ])("strips the trailing tag in %j", (title) => {
      expect(normalizeTitle(title)).toBe("solo leveling");
    });

    it("strips several trailing tags in a row", () => {
      expect(normalizeTitle("Frieren (German Dub) [Remastered]")).toBe("frieren");
    });

    it("keeps a tag that is not at the end as ordinary words", () => {
      expect(normalizeTitle("Solo Leveling (Official) Side Story")).toBe(
        "solo leveling official side story",
      );
    });

    it("keeps unknown bracketed suffixes as ordinary words", () => {
      expect(normalizeTitle("Re:Zero (Season 2)")).toBe("re zero season 2");
    });

    it("keeps a tag when nothing else would remain", () => {
      expect(normalizeTitle("(Manga)")).toBe("manga");
    });
  });

  describe("unicode", () => {
    it("folds fullwidth letters to ASCII", () => {
      expect(normalizeTitle("Ｓｏｌｏ Ｌｅｖｅｌｉｎｇ")).toBe("solo leveling");
    });

    it("expands ligatures", () => {
      expect(normalizeTitle("The Ofﬁce Hunter")).toBe("the office hunter");
    });

    it("strips Latin diacritics", () => {
      expect(normalizeTitle("Tōkyō Ghoul")).toBe("tokyo ghoul");
      expect(normalizeTitle("Pokémon Adventures")).toBe("pokemon adventures");
    });

    it("lowercases a dotted capital I without leaving a combining mark", () => {
      expect(normalizeTitle("İstanbul Knights")).toBe("istanbul knights");
    });

    it("removes invisible format characters", () => {
      expect(normalizeTitle("Solo \u200BLeveling\u200B")).toBe("solo leveling");
      expect(normalizeTitle("Lev\u00ADeling Up")).toBe("leveling up");
      expect(normalizeTitle("\uFEFFSolo Leveling")).toBe("solo leveling");
    });

    it("preserves Hangul", () => {
      expect(normalizeTitle("나 혼자만 레벨업")).toBe("나 혼자만 레벨업");
    });

    it("preserves kana with voiced marks", () => {
      expect(normalizeTitle("ダンジョン飯")).toBe("ダンジョン飯");
    });

    it("composes halfwidth katakana into fullwidth kana", () => {
      expect(normalizeTitle("ﾀﾞﾝｼﾞｮﾝ")).toBe("ダンジョン");
    });

    it("preserves Hanzi", () => {
      expect(normalizeTitle("斗破苍穹")).toBe("斗破苍穹");
    });

    it("keeps combining vowel signs in scripts that need them", () => {
      expect(normalizeTitle("हिन्दी")).toBe("हिन्दी");
    });
  });

  describe("idempotence", () => {
    it.each([
      ["Swordmaster’s Youngest Son"],
      ["Warrior High School – Dungeon Raid Department"],
      ["Player Who Returned 10,000 Years Later"],
      ["Frieren (German Dub) [Remastered]"],
      ["Tōkyō Ghoul"],
      ["ﾀﾞﾝｼﾞｮﾝ"],
      ["İstanbul Knights"],
    ])("returns the same value when applied twice to %j", (title) => {
      const once = normalizeTitle(title);
      expect(normalizeTitle(once)).toBe(once);
    });
  });
});
