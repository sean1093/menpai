/**
 * Property: any well-formed combination of parts, written out in Chinese in any
 * of the accepted spellings (臺/台, Chinese or full-width numerals, 3F / 3樓,
 * 1-1號 / 1之1號, stray spaces), parses back and formats to the same English.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeList } from "../src/codec.js";
import { AREAS, CITIES } from "../src/data/places.js";
import { ROADS } from "../src/data/roads.js";
import { VILLAGES } from "../src/data/villages.js";
import { format, parse } from "../src/index.js";
import type { AddressParts } from "../src/types.js";

const roadNames = [...decodeList(ROADS).keys()].filter(
  (zh) => /(大道|路|街)$/.test(zh) && !/[0-9段巷弄村里]/.test(zh) && zh.length <= 8,
);
const villageNames = [...decodeList(VILLAGES).keys()].filter(
  (zh) => !/[0-9]/.test(zh) && zh.length <= 5,
);
const areaRows = AREAS.filter((row) => row[1] !== "");

const ZH_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
function toZhNumeral(n: number): string {
  if (n >= 1000) {
    const rest = n % 1000;
    const head = `${ZH_DIGITS[Math.floor(n / 1000)]}千`;
    if (rest === 0) return head;
    return rest < 100 ? `${head}零${toZhNumeral(rest)}` : head + toZhNumeral(rest);
  }
  if (n < 10) return ZH_DIGITS[n] ?? "";
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${tens === 1 ? "" : ZH_DIGITS[tens]}十${ones === 0 ? "" : ZH_DIGITS[ones]}`;
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (rest === 0) return `${ZH_DIGITS[hundreds]}百`;
  if (rest < 10) return `${ZH_DIGITS[hundreds]}百零${ZH_DIGITS[rest]}`;
  return `${ZH_DIGITS[hundreds]}百${toZhNumeral(rest)}`;
}
const toFullWidth = (s: string) =>
  s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));

type NumeralStyle = "ascii" | "fullwidth" | "chinese";
function renderNumber(n: string, style: NumeralStyle): string {
  if (style === "fullwidth") return toFullWidth(n);
  if (style === "chinese") return toZhNumeral(Number(n));
  return n;
}

const numeralStyle = fc.constantFrom<NumeralStyle>("ascii", "fullwidth", "chinese");
const smallNumber = fc.integer({ min: 1, max: 999 }).map(String);

const partsArb: fc.Arbitrary<AddressParts> = fc
  .record({
    areaRow: fc.constantFrom(...areaRows),
    zip: fc.constantFrom<"none" | "3" | "6">("none", "3", "6"),
    zip3more: fc.integer({ min: 0, max: 999 }).map((n) => String(n).padStart(3, "0")),
    village: fc.option(fc.constantFrom(...villageNames), { nil: undefined }),
    neighborhood: fc.option(fc.integer({ min: 1, max: 60 }).map(String), { nil: undefined }),
    road: fc.constantFrom(...roadNames),
    section: fc.option(fc.integer({ min: 1, max: 9 }).map(String), { nil: undefined }),
    lane: fc.option(smallNumber, { nil: undefined }),
    alley: fc.option(smallNumber, { nil: undefined }),
    number: fc.integer({ min: 1, max: 9999 }).map(String),
    numberSuffix: fc.option(fc.integer({ min: 1, max: 99 }).map(String), { nil: undefined }),
    floor: fc.option(fc.integer({ min: 1, max: 99 }).map(String), { nil: undefined }),
    floorSuffix: fc.option(fc.integer({ min: 1, max: 99 }).map(String), { nil: undefined }),
    room: fc.option(fc.integer({ min: 1, max: 999 }).map(String), { nil: undefined }),
  })
  .map((r) => {
    const city = CITIES[r.areaRow[0]];
    const parts: AddressParts = {
      city: city?.[0] ?? "",
      area: r.areaRow[1],
      road: r.road,
      number: r.number,
    };
    if (r.zip === "3") parts.postalCode = r.areaRow[3];
    if (r.zip === "6") parts.postalCode = r.areaRow[3] + r.zip3more;
    if (r.village !== undefined) parts.village = r.village;
    if (r.village !== undefined && r.neighborhood !== undefined)
      parts.neighborhood = r.neighborhood;
    if (r.section !== undefined) parts.section = r.section;
    if (r.lane !== undefined) parts.lane = r.lane;
    if (r.lane !== undefined && r.alley !== undefined) parts.alley = r.alley;
    if (r.numberSuffix !== undefined) parts.numberSuffix = r.numberSuffix;
    if (r.floor !== undefined) parts.floor = r.floor;
    if (r.floor !== undefined && r.floorSuffix !== undefined) parts.floorSuffix = r.floorSuffix;
    if (r.room !== undefined) parts.room = r.room;
    return parts;
  });

interface Style {
  tai: boolean;
  numerals: NumeralStyle;
  sectionNumerals: NumeralStyle;
  floorAsF: boolean;
  suffixStyle: "之" | "-" | "號之";
  separator: "" | " " | "，";
}
const styleArb: fc.Arbitrary<Style> = fc.record({
  tai: fc.boolean(),
  numerals: numeralStyle,
  sectionNumerals: numeralStyle,
  floorAsF: fc.boolean(),
  suffixStyle: fc.constantFrom<"之" | "-" | "號之">("之", "-", "號之"),
  separator: fc.constantFrom<"" | " " | "，">("", " ", "，"),
});

/** Writes the parts back out as a Chinese address in the requested spelling. */
function compose(parts: AddressParts, style: Style): string {
  const n = (v: string) => renderNumber(v, style.numerals);
  const tokens: string[] = [];
  if (parts.postalCode) tokens.push(parts.postalCode);
  tokens.push(style.tai ? (parts.city ?? "").replace(/臺/g, "台") : (parts.city ?? ""));
  tokens.push(parts.area ?? "");
  if (parts.village) tokens.push(parts.village);
  if (parts.neighborhood) tokens.push(`${n(parts.neighborhood)}鄰`);
  tokens.push(style.tai ? (parts.road ?? "").replace(/臺/g, "台") : (parts.road ?? ""));
  if (parts.section) tokens.push(`${renderNumber(parts.section, style.sectionNumerals)}段`);
  if (parts.lane) tokens.push(`${n(parts.lane)}巷`);
  if (parts.alley) tokens.push(`${n(parts.alley)}弄`);
  if (parts.number) {
    const suffix = parts.numberSuffix;
    if (suffix === undefined) tokens.push(`${n(parts.number)}號`);
    else if (style.suffixStyle === "之") tokens.push(`${n(parts.number)}之${n(suffix)}號`);
    else if (style.suffixStyle === "-") tokens.push(`${n(parts.number)}-${n(suffix)}號`);
    else tokens.push(`${n(parts.number)}號之${n(suffix)}`);
  }
  if (parts.floor) {
    const suffix =
      parts.floorSuffix === undefined
        ? ""
        : style.floorAsF
          ? `-${n(parts.floorSuffix)}`
          : `之${n(parts.floorSuffix)}`;
    tokens.push(style.floorAsF ? `${parts.floor}F${suffix}` : `${n(parts.floor)}樓${suffix}`);
  }
  if (parts.room) tokens.push(`${n(parts.room)}室`);
  // `1樓之1` directly followed by `1室` is ambiguous in Chinese too; a writer
  // would separate two adjacent numerals, so the generator always does.
  const NUMERAL = /[0-9０-９〇一二三四五六七八九十百千]/;
  let out = "";
  for (const token of tokens) {
    if (out.length > 0) {
      const glue =
        style.separator === "" && NUMERAL.test(out.slice(-1)) && NUMERAL.test(token.charAt(0))
          ? " "
          : style.separator;
      out += glue;
    }
    out += token;
  }
  return out;
}

const NUMERIC_KEYS = [
  "postalCode",
  "neighborhood",
  "section",
  "lane",
  "alley",
  "number",
  "numberSuffix",
  "floor",
  "floorSuffix",
  "room",
] as const;

describe("property: compose → parse → format is stable", () => {
  it("parses back every generated address and formats it identically", () => {
    fc.assert(
      fc.property(partsArb, styleArb, (parts, style) => {
        const text = compose(parts, style);
        const parsed = parse(text);
        expect(parsed.ok, text).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.unparsed, text).toBe("");
        expect(
          parsed.warnings.map((w) => w.code),
          text,
        ).toEqual([]);
        expect(parsed.parts.city, text).toBe(parts.city);
        expect(parsed.parts.area, text).toBe(parts.area);
        for (const key of NUMERIC_KEYS)
          expect(parsed.parts[key], `${key} in ${text}`).toBe(parts[key]);
        // Village/road may legitimately re-split (中正里 + 中正路 vs the composite
        // 中正里中正路 entry); the English must be identical either way.
        const expected = format(parts);
        const actual = format(parsed.parts);
        expect(actual.english, text).toBe(expected.english);
        expect(actual.confidence, text).toBe("exact");
      }),
      { numRuns: 500 },
    );
  });

  it("format is deterministic and side-effect free", () => {
    fc.assert(
      fc.property(partsArb, (parts) => {
        const copy = structuredClone(parts);
        const a = format(parts);
        const b = format(parts, { romanization: "tongyong" });
        const c = format(parts);
        expect(parts).toEqual(copy);
        expect(a).toEqual(c);
        expect(b.segments.length).toBe(a.segments.length);
      }),
      { numRuns: 200 },
    );
  });
});
