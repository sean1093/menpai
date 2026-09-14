import { describe, expect, it } from "vitest";
import { convertRomanization, splitSyllables, toTongyong, toWadeGiles } from "../src/romanize.js";

describe("splitSyllables", () => {
  const cases: [string, string[] | null][] = [
    ["Zhongxiao", ["zhong", "xiao"]],
    ["Da'an", ["da", "an"]],
    ["Ren'ai", ["ren", "ai"]],
    ["Jingan", ["jin", "gan"]],
    ["Xian", ["xian"]],
    ["Fangang", ["fan", "gang"]],
    ["Keelung", null],
    ["Roosevelt", null],
    ["Civic", null],
    ["Tamsui", null],
    ["Lukang", ["lu", "kang"]],
  ];
  for (const [word, expected] of cases) {
    it(`${word} → ${expected === null ? "opaque" : expected.join("·")}`, () => {
      expect(splitSyllables(word)).toEqual(expected);
    });
  }
});

describe("toTongyong", () => {
  const pairs: [string, string][] = [
    ["zhong", "jhong"],
    ["xiao", "siao"],
    ["qiao", "ciao"],
    ["xiong", "syong"],
    ["wen", "wun"],
    ["feng", "fong"],
    ["weng", "wong"],
    ["liu", "liou"],
    ["gui", "guei"],
    ["qu", "cyu"],
    ["xue", "syue"],
    ["jun", "jyun"],
    ["zhi", "jhih"],
    ["si", "sih"],
    ["ri", "rih"],
    ["ban", "ban"],
    ["an", "an"],
    ["yu", "yu"],
  ];
  for (const [hanyu, tongyong] of pairs) {
    it(`${hanyu} → ${tongyong}`, () => expect(toTongyong(hanyu)).toBe(tongyong));
  }
});

describe("toWadeGiles (simplified)", () => {
  const pairs: [string, string][] = [
    ["zhong", "chung"],
    ["xiao", "hsiao"],
    ["gao", "kao"],
    ["xiong", "hsiung"],
    ["ren", "jen"],
    ["dun", "tun"],
    ["he", "ho"],
    ["jian", "chien"],
    ["guo", "kuo"],
    ["zi", "tzu"],
    ["si", "ssu"],
    ["shi", "shih"],
    ["xue", "hsueh"],
    ["yi", "yi"],
    ["ye", "yeh"],
    ["luo", "lo"],
    ["shuo", "shuo"],
    ["gui", "kuei"],
    ["er", "erh"],
  ];
  for (const [hanyu, wg] of pairs) {
    it(`${hanyu} → ${wg}`, () => expect(toWadeGiles(hanyu)).toBe(wg));
  }
});

describe("convertRomanization", () => {
  it("converts only pinyin words, keeps abbreviations and conventional spellings", () => {
    expect(convertRomanization("Sec. 4, Zhongxiao E. Rd.", "tongyong")).toBe(
      "Sec. 4, Jhongsiao E. Rd.",
    );
    expect(convertRomanization("Sec. 4, Zhongxiao E. Rd.", "wade-giles")).toBe(
      "Sec. 4, Chunghsiao E. Rd.",
    );
    expect(convertRomanization("Roosevelt Rd.", "tongyong")).toBe("Roosevelt Rd.");
    expect(convertRomanization("Ln. 2, Sanmin Market", "wade-giles")).toBe("Ln. 2, Sanmin Market");
    expect(convertRomanization("Da'an Dist.", "wade-giles")).toBe("Ta'an Dist.");
    expect(convertRomanization("Lane 5", "wade-giles")).toBe("Lane 5");
  });

  it("is the identity for hanyu", () => {
    expect(convertRomanization("Anything At All", "hanyu")).toBe("Anything At All");
  });
});
