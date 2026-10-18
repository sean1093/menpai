/**
 * The front-coded dictionary format, both directions.
 *
 * `src/codec.ts` holds an encoder used only by `scripts/build-data.ts` and a
 * decoder used by every dictionary lookup at runtime. The decoders were covered
 * incidentally — a wrong `decodeList` fails hundreds of tests — but the encoders
 * were at 0%, and they are what *produces* the shipped data. A matched pair
 * maintained in one file can drift together in a way no lookup test notices, so
 * the round-trip is asserted directly.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeChars, decodeList, encodeChars, encodeList } from "../src/codec.js";
import { CHARS } from "../src/data/chars.js";
import { ROADS } from "../src/data/roads.js";
import { VILLAGES } from "../src/data/villages.js";

/**
 * The format is line- and tab-delimited with no escaping, so a name containing
 * either character would not survive a round-trip. No official name does. This
 * is asserted on the shipped data rather than guarded in the encoder, because
 * the data is the thing that could change: a future source file with a stray
 * tab would corrupt every entry after it, and the failure would surface as
 * mangled addresses rather than as a build error.
 */
const DELIMITERS = /[\t\n]/;

describe("codec", () => {
  describe.each([
    ["roads", ROADS],
    ["villages", VILLAGES],
  ])("shipped %s table", (_name, raw) => {
    const table = decodeList(raw);

    it("re-encodes byte-for-byte", () => {
      // Pins the shipped artefact to the encoder that claims to have produced
      // it. If `build-data.ts` and the runtime ever disagree about the format,
      // this fails without needing the source CSVs.
      expect(encodeList(table)).toBe(raw);
    });

    it("holds no key or value containing a delimiter", () => {
      expect([...table.keys()].filter((k) => DELIMITERS.test(k))).toEqual([]);
      expect([...table.values()].filter((v) => DELIMITERS.test(v))).toEqual([]);
    });

    it("is sorted, which is what makes front-coding worth anything", () => {
      const keys = [...table.keys()];
      expect(keys).toEqual([...keys].sort());
    });
  });

  it("round-trips the shipped character readings", () => {
    const readings = decodeChars(CHARS);
    expect(readings.size).toBeGreaterThan(10_000);
    expect(encodeChars(readings)).toBe(CHARS);
  });

  describe("round-trip", () => {
    // Keys are drawn from a small alphabet so that shared prefixes actually
    // occur — random CJK would almost never collide, and prefix sharing is the
    // whole mechanism under test.
    const key = fc.stringMatching(/^[甲乙丙]{1,12}$/);
    const override = fc.oneof(fc.constant(""), fc.stringMatching(/^[A-Za-z. ]{1,12}$/));

    it("preserves any map of names to overrides", () => {
      fc.assert(
        fc.property(fc.array(fc.tuple(key, override), { maxLength: 60 }), (pairs) => {
          const input = new Map(pairs);
          const output = decodeList(encodeList(input));
          expect(output.size).toBe(input.size);
          for (const [k, v] of input) expect(output.get(k)).toBe(v);
        }),
        { numRuns: 200 },
      );
    });

    it("survives a shared prefix longer than one base-36 digit can hold", () => {
      // The prefix length is stored as a single base-36 character, so the
      // encoder clamps sharing at 35. Keys that agree for longer than that must
      // still decode exactly — the clamp costs bytes, never correctness.
      const stem = "甲".repeat(40);
      const table = new Map([
        [`${stem}一`, ""],
        [`${stem}二`, "Second"],
      ]);
      const output = decodeList(encodeList(table));
      expect(output.get(`${stem}一`)).toBe("");
      expect(output.get(`${stem}二`)).toBe("Second");
    });

    it("keeps an empty table empty", () => {
      expect(decodeList(encodeList(new Map())).size).toBe(0);
    });
  });

  describe("decodeChars", () => {
    it("maps every character of a line to that line's syllable", () => {
      const readings = decodeChars("zhong:中鍾\nshan:山");
      expect(readings.get("中")).toBe("zhong");
      expect(readings.get("鍾")).toBe("zhong");
      expect(readings.get("山")).toBe("shan");
    });

    it("ignores a line with no colon rather than inventing a reading", () => {
      const readings = decodeChars("zhong:中\ngarbage\nshan:山");
      expect(readings.size).toBe(2);
      expect(readings.has("garbage")).toBe(false);
    });
  });
});
