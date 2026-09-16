import { describe, expect, it } from "vitest";
import { AREAS } from "../src/data/places.js";
import { parse } from "../src/index.js";
import type { AddressParts, ParseWarningCode } from "../src/types.js";

interface Case {
  name: string;
  input: string;
  parts: AddressParts;
  warnings?: ParseWarningCode[];
  unparsed?: string;
}

const base: AddressParts = {
  city: "臺北市",
  area: "大安區",
  road: "忠孝東路",
  section: "4",
  number: "1",
  floor: "3",
  floorSuffix: "2",
};

/** Everything above the floor for the basement cases below. */
const basement: AddressParts = {
  city: "臺北市",
  area: "中正區",
  road: "重慶南路",
  section: "1",
  number: "122",
};

const cases: Case[] = [
  { name: "canonical", input: "臺北市大安區忠孝東路四段1號3樓之2", parts: base },
  { name: "台 variant", input: "台北市大安區忠孝東路四段1號3樓之2", parts: base },
  { name: "full-width digits", input: "台北市大安區忠孝東路４段１號３樓之２", parts: base },
  { name: "digit section", input: "台北市大安區忠孝東路4段1號3樓之2", parts: base },
  { name: "3F for 3樓", input: "台北市大安區忠孝東路四段1號3F-2", parts: base },
  { name: "lower-case f", input: "台北市大安區忠孝東路四段1號3f-2", parts: base },
  { name: "whitespace everywhere", input: " 台北市 大安區 忠孝東路 四段 1號 3樓之2 ", parts: base },
  {
    name: "commas as separators",
    input: "106，台北市，大安區，忠孝東路四段1號，3樓之2",
    parts: { postalCode: "106", ...base },
  },
  {
    name: "3-digit postal code",
    input: "106台北市大安區忠孝東路四段1號3樓之2",
    parts: { postalCode: "106", ...base },
  },
  {
    name: "3+2 postal code",
    input: "10607台北市大安區忠孝東路四段1號3樓之2",
    parts: { postalCode: "10607", ...base },
  },
  {
    name: "3+3 postal code",
    input: "106070台北市大安區忠孝東路四段1號3樓之2",
    parts: { postalCode: "106070", ...base },
  },
  {
    name: "3+3 postal code with hyphen",
    input: "106-070 台北市大安區忠孝東路四段1號3樓之2",
    parts: { postalCode: "106070", ...base },
  },
  {
    name: "wrong postal code is kept and flagged",
    input: "110台北市大安區忠孝東路四段1號3樓之2",
    parts: { postalCode: "110", ...base },
    warnings: ["postal-code-mismatch"],
  },
  {
    name: "lane, alley, number suffix, room",
    input: "臺北市大安區忠孝東路四段216巷27弄1-1號3樓之2 5室",
    parts: {
      city: "臺北市",
      area: "大安區",
      road: "忠孝東路",
      section: "4",
      lane: "216",
      alley: "27",
      number: "1",
      numberSuffix: "1",
      floor: "3",
      floorSuffix: "2",
      room: "5",
    },
  },
  {
    name: "之 number suffix",
    input: "臺北市大安區忠孝東路四段1之1號",
    parts: {
      city: "臺北市",
      area: "大安區",
      road: "忠孝東路",
      section: "4",
      number: "1",
      numberSuffix: "1",
    },
  },
  {
    name: "號之 number suffix",
    input: "臺北市大安區忠孝東路四段1號之1",
    parts: {
      city: "臺北市",
      area: "大安區",
      road: "忠孝東路",
      section: "4",
      number: "1",
      numberSuffix: "1",
    },
  },
  {
    name: "chinese numerals for lane, number and floor",
    input: "臺北市大安區忠孝東路四段二一六巷十二號十二樓",
    parts: {
      city: "臺北市",
      area: "大安區",
      road: "忠孝東路",
      section: "4",
      lane: "216",
      number: "12",
      floor: "12",
    },
  },
  {
    name: "ordinal road name is not a lane number",
    input: "高雄市三民區民族一路100號",
    parts: { city: "高雄市", area: "三民區", road: "民族一路", number: "100" },
  },
  {
    name: "multi-reading road stays intact",
    input: "臺北市大同區重慶北路二段123號",
    parts: { city: "臺北市", area: "大同區", road: "重慶北路", section: "2", number: "123" },
  },
  {
    name: "台 inside a road name",
    input: "臺中市西區台灣大道二段2號",
    parts: { city: "臺中市", area: "西區", road: "臺灣大道", section: "2", number: "2" },
  },
  {
    name: "sub-alley",
    input: "臺北市大安區忠孝東路四段216巷27弄3衖1號",
    parts: {
      city: "臺北市",
      area: "大安區",
      road: "忠孝東路",
      section: "4",
      lane: "216",
      alley: "27",
      subAlley: "3",
      number: "1",
    },
  },
  {
    name: "village, neighborhood, place name instead of road",
    input: "嘉義縣民雄鄉豊收村3鄰好收5號",
    parts: {
      city: "嘉義縣",
      area: "民雄鄉",
      village: "豊收村",
      neighborhood: "3",
      road: "好收",
      number: "5",
    },
  },
  {
    name: "named section",
    input: "新竹縣竹北市文山路亞東段10號",
    parts: { city: "新竹縣", area: "竹北市", road: "文山路亞東段", number: "10" },
  },
  {
    name: "composite named lane in dictionary",
    input: "南投縣草屯鎮中正路中正巷3號",
    parts: { city: "南投縣", area: "草屯鎮", road: "中正路中正巷", number: "3" },
  },
  {
    name: "named lane not in dictionary",
    input: "臺中市大肚區遊園路一段七十二北巷5號",
    parts: {
      city: "臺中市",
      area: "大肚區",
      road: "遊園路",
      section: "1",
      lane: "七十二北巷",
      number: "5",
    },
  },
  {
    name: "same-named district disambiguated by city (Taichung)",
    input: "臺中市西區民生路1號",
    parts: { city: "臺中市", area: "西區", road: "民生路", number: "1" },
  },
  {
    name: "same-named district disambiguated by city (Kaohsiung)",
    input: "高雄市三民區建工路1號",
    parts: { city: "高雄市", area: "三民區", road: "建工路", number: "1" },
  },
  {
    name: "city inferred from a uniquely named district",
    input: "板橋區文化路一段188號",
    parts: { city: "新北市", area: "板橋區", road: "文化路", section: "1", number: "188" },
    warnings: ["city-inferred-from-area"],
  },
  {
    name: "ambiguous district resolved by postal code",
    input: "106大安區忠孝東路四段1號",
    parts: {
      postalCode: "106",
      city: "臺北市",
      area: "大安區",
      road: "忠孝東路",
      section: "4",
      number: "1",
    },
    warnings: ["city-inferred-from-area"],
  },
  {
    name: "pre-2014 county and township names",
    input: "桃園縣中壢市中央西路二段30號",
    parts: { city: "桃園市", area: "中壢區", road: "中央西路", section: "2", number: "30" },
    warnings: ["city-alias", "area-alias"],
  },
  {
    name: "city without district (Hsinchu City)",
    input: "新竹市光復路一段7號",
    parts: { city: "新竹市", road: "光復路", section: "1", number: "7" },
  },
  {
    name: "unknown road falls back to shape",
    input: "臺北市信義區不存在的路99號",
    parts: { city: "臺北市", area: "信義區", road: "不存在的路", number: "99" },
  },
  {
    name: "trailing building name is reported, not swallowed",
    input: "臺北市信義區市府路1號市政大樓",
    parts: { city: "臺北市", area: "信義區", road: "市府路", number: "1" },
    warnings: ["unparsed-remainder"],
    unparsed: "市政大樓",
  },
  {
    name: "地下N樓 basement",
    input: "臺北市中正區重慶南路一段122號地下2樓",
    parts: { ...basement, floor: "B2" },
  },
  {
    name: "地下 with a Chinese numeral",
    input: "臺北市中正區重慶南路一段122號地下二樓",
    parts: { ...basement, floor: "B2" },
  },
  {
    name: "BN basement",
    input: "臺北市中正區重慶南路一段122號B2",
    parts: { ...basement, floor: "B2" },
  },
  {
    name: "BNF basement",
    input: "臺北市中正區重慶南路一段122號B2F",
    parts: { ...basement, floor: "B2" },
  },
  {
    name: "lower-case bN basement",
    input: "臺北市中正區重慶南路一段122號b2",
    parts: { ...basement, floor: "B2" },
  },
  {
    name: "B2樓 basement",
    input: "臺北市中正區重慶南路一段122號B2樓",
    parts: { ...basement, floor: "B2" },
  },
  {
    name: "basement with a floor suffix",
    input: "臺北市中正區重慶南路一段122號地下2樓之3",
    parts: { ...basement, floor: "B2", floorSuffix: "3" },
  },
  {
    name: "basement with a hyphen suffix",
    input: "臺北市中正區重慶南路一段122號B2-3",
    parts: { ...basement, floor: "B2", floorSuffix: "3" },
  },
  {
    name: "basement then room",
    input: "臺北市中正區重慶南路一段122號地下2樓 5室",
    parts: { ...basement, floor: "B2", room: "5" },
  },
  {
    name: "地下N層 basement",
    input: "臺北市中正區重慶南路一段122號地下一層",
    parts: { ...basement, floor: "B1" },
  },
  {
    name: "地下N層 keeps the room",
    input: "臺北市中正區重慶南路一段122號地下二層5室",
    parts: { ...basement, floor: "B2", room: "5" },
  },
  {
    name: "bare B before a separated room",
    input: "臺北市中正區重慶南路一段122號B2 5室",
    parts: { ...basement, floor: "B2", room: "5" },
  },
  {
    name: "full-width Ｂ１ basement",
    input: "臺北市中正區重慶南路一段122號Ｂ１",
    parts: { ...basement, floor: "B1" },
  },
  {
    name: "lettered room",
    input: "臺北市中正區重慶南路一段122號3樓A室",
    parts: { ...basement, floor: "3", room: "A" },
  },
  {
    name: "lettered room is upper-cased",
    input: "臺北市中正區重慶南路一段122號3樓a室",
    parts: { ...basement, floor: "3", room: "A" },
  },
  {
    name: "letter-and-digit room",
    input: "臺北市中正區重慶南路一段122號A1室",
    parts: { ...basement, room: "A1" },
  },
  {
    name: "full-width lettered room",
    input: "臺北市中正區重慶南路一段122號Ａ１室",
    parts: { ...basement, room: "A1" },
  },
  {
    name: "lettered floor suffix",
    input: "臺北市中正區重慶南路一段122號3樓之A",
    parts: { ...basement, floor: "3", floorSuffix: "A" },
  },
  {
    name: "lettered floor suffix after 3F-",
    input: "臺北市中正區重慶南路一段122號3F-A",
    parts: { ...basement, floor: "3", floorSuffix: "A" },
  },
  {
    // Not a basement: `B25室` is unit B25. Before lettered units existed this
    // stayed in `unparsed`; reading it as a *floor* would still be wrong.
    name: "B25室 is room B25, not floor B25",
    input: "臺北市中正區重慶南路一段122號B25室",
    parts: { ...basement, room: "B25" },
  },
  {
    // A block marker after the letter means it was never a unit: the floor is
    // still read, but `之B棟` is reported whole rather than half-consumed.
    name: "block marker after a lettered suffix is refused",
    input: "臺北市中正區重慶南路一段122號3樓之B棟",
    parts: { ...basement, floor: "3" },
    warnings: ["unparsed-remainder"],
    unparsed: "之B棟",
  },
  {
    name: "block marker 座 after a lettered suffix is refused",
    input: "臺北市中正區重慶南路一段122號3樓之B座",
    parts: { ...basement, floor: "3" },
    warnings: ["unparsed-remainder"],
    unparsed: "之B座",
  },
  {
    name: "bare basement with a lettered suffix",
    input: "臺北市中正區重慶南路一段122號B1-A",
    parts: { ...basement, floor: "B1", floorSuffix: "A" },
  },
  {
    name: "bare basement before a lettered room",
    input: "臺北市中正區重慶南路一段122號B2 A室",
    parts: { ...basement, floor: "B2", room: "A" },
  },
  {
    name: "地下道 is not a basement floor",
    input: "臺北市信義區市府路1號地下道",
    parts: { city: "臺北市", area: "信義區", road: "市府路", number: "1" },
    warnings: ["unparsed-remainder"],
    unparsed: "地下道",
  },
  // A bare `B<digit>` is also how a building labels a block. Claiming a basement
  // there would invent a floor *and* discard the real one, which is worse than
  // admitting we do not know — so each of these stays whole in `unparsed`.
  ...(
    [
      "地下室",
      "地下停車場",
      "B1棟5樓",
      "B1座10樓",
      "B1館3樓",
      "B1區",
      "B2號",
      "B1號5樓",
      "b2c咖啡",
      "B2 Building",
      "B2大樓",
      "B棟5樓",
      // Two letters or three digits is a building name, not a unit.
      "AB室",
      "A123室",
      "會議室",
      // No separator: could be block B2 room A, or room B2A. Do not guess.
      "B2A室",
    ] as const
  ).map((tail) => ({
    name: `"${tail}" is not a basement floor`,
    input: `臺北市中正區重慶南路一段122號${tail}`,
    parts: basement,
    warnings: ["unparsed-remainder"] as ParseWarningCode[],
    unparsed: tail,
  })),
];

describe("parse", () => {
  for (const c of cases) {
    it(c.name, () => {
      const result = parse(c.input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.parts).toEqual(c.parts);
      expect(result.warnings.map((w) => w.code)).toEqual(c.warnings ?? []);
      expect(result.unparsed).toBe(c.unparsed ?? "");
    });
  }

  it("names the candidate cities when a district is ambiguous", () => {
    const result = parse("大安區中山路1號");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("area-ambiguous");
    expect(result.error.candidates).toEqual(["臺北市", "臺中市"]);
    for (const city of result.error.candidates ?? []) {
      expect(result.error.message).toContain(city);
    }
  });

  it("keeps the candidates when a postal code matches none of them", () => {
    // A code that belongs to no candidate says nothing about which city was
    // meant; the old behaviour reported "exists in more than one city ()".
    const result = parse("999大安區中山路1號");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.candidates).toEqual(["臺北市", "臺中市"]);
    expect(result.error.message).not.toContain("()");
  });

  it("every candidate it offers actually resolves the ambiguity", () => {
    // The contract the site's tap-to-choose buttons rely on. Asserting only
    // `ok` and `city` is not enough: "臺北市999大安區中山路1號" is `ok` with the
    // right city while the district, road and number are all gone.
    const byName = new Map<string, Set<number>>();
    for (const [cityIndex, zh] of AREAS) {
      if (zh === "") continue;
      if (!byName.has(zh)) byName.set(zh, new Set());
      byName.get(zh)?.add(cityIndex);
    }
    const ambiguous = [...byName.entries()].filter(([, cities]) => cities.size > 1);
    // Districts in 3+ cities (東區 is in four) are the cases most worth covering,
    // so count exactly rather than leaving slack that could silently skip them.
    const expected = ambiguous.reduce((n, [, cities]) => n + cities.size, 0);
    expect(ambiguous.length).toBeGreaterThan(0);

    let checked = 0;
    for (const [zh] of ambiguous) {
      // Both shapes the site's button produces: with and without a postal code.
      for (const [prefix, rest] of [
        ["", `${zh}中山路1號`],
        ["999", `${zh}中山路1號`],
      ] as const) {
        const result = parse(prefix + rest);
        expect(result.ok, prefix + rest).toBe(false);
        if (result.ok) continue;
        expect(result.error.code, prefix + rest).toBe("area-ambiguous");
        const candidates = result.error.candidates ?? [];
        expect(candidates.length, prefix + rest).toBeGreaterThan(1);
        for (const city of candidates) {
          // The city is inserted after any postal code, as the site does it.
          const input = prefix + city + rest;
          const fixed = parse(input);
          expect(fixed.ok, input).toBe(true);
          if (!fixed.ok) continue;
          expect(fixed.parts.city, input).toBe(city);
          expect(fixed.parts.area, input).toBe(zh);
          expect(fixed.parts.road, input).toBe("中山路");
          expect(fixed.parts.number, input).toBe("1");
          expect(fixed.unparsed, input).toBe("");
          if (prefix === "") checked++;
        }
      }
    }
    expect(checked).toBe(expected);
  });

  it("does not set candidates for other failures", () => {
    const result = parse("忠孝東路四段1號");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("city-not-found");
    expect(result.error.candidates).toBeUndefined();
  });

  it("rejects empty input", () => {
    expect(parse("   ")).toEqual({
      ok: false,
      error: { code: "empty-input", message: expect.any(String) },
    });
  });

  it("rejects input without a city", () => {
    const result = parse("忠孝東路四段1號");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("city-not-found");
  });

  it("rejects a district that exists in several cities when nothing disambiguates it", () => {
    const result = parse("大安區忠孝東路四段1號");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("area-ambiguous");
    expect(result.error.message).toContain("臺北市");
    expect(result.error.message).toContain("臺中市");
  });

  it("rejects garbage", () => {
    const result = parse("hello world");
    expect(result.ok).toBe(false);
  });
});
