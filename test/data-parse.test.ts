/**
 * The official corpus, replayed through `parse()`.
 *
 * `test/data.test.ts` replays the same files through `format()`, which pins the
 * derivation rules to the official English. Nothing replayed them through
 * `parse()` — so the 30,030 road names and 5,145 villages this package vendors
 * protected the formatter and not the parser, and "the official replay passes"
 * meant nothing for a parser change.
 *
 * That gap is not theoretical. Lowering `MAX_ROAD_LENGTH` from 16 to 10 passes
 * every one of the other tests in this suite and silently drops the house
 * number from five real road names — the exact failure mode the library
 * promises not to have. This file is what notices.
 *
 * Each case is a whole address, because that is the only way to prove nothing
 * was lost: the test reassembles the road-ish parts the parser filled in and
 * compares them against the name it was given, so a fragment left in
 * `unparsed` fails rather than being quietly tolerated.
 */
import { describe, expect, it } from "vitest";
import { decodeList } from "../src/codec.js";
import { ROADS } from "../src/data/roads.js";
import { VILLAGES } from "../src/data/villages.js";
import { parse } from "../src/index.js";
import { normalizeSections, normalizeZh } from "../src/text.js";
import type { AddressParts } from "../src/types.js";
import { csvRows, readSource } from "./helpers/official-data.js";

/**
 * A city and district that are unambiguous and carry no road of their own, so
 * any failure is attributable to the name under test.
 */
const WHERE = "臺北市大安區";

/**
 * Everything the parser may legitimately attribute a road name to, in the order
 * it appears in an address. Joined back together this must equal the input name
 * exactly — that equality is the no-loss assertion.
 */
function roadish(parts: AddressParts): string {
  return [
    parts.village ?? "",
    parts.road ?? "",
    parts.section ? `${parts.section}段` : "",
    parts.lane ? `${parts.lane}巷` : "",
    parts.alley ? `${parts.alley}弄` : "",
    parts.subAlley ? `${parts.subAlley}衖` : "",
  ].join("");
}

const roads = decodeList(ROADS);
const villages = decodeList(VILLAGES);

/**
 * Road-list keys that begin with a real village name — `福星里福星`
 * ("Fuxing, Fuxing Vil."). These are the shape that made a greedy dictionary
 * match swallow the village plus a fragment and strand the rest of the address,
 * so they get tested in both directions rather than left to chance.
 */
const compound: [string, string][] = [];
for (const road of roads.keys()) {
  for (let i = 2; i < road.length; i++) {
    const head = road.slice(0, i);
    if (villages.has(head)) {
      compound.push([head, road.slice(i)]);
      break;
    }
  }
}

/** The longest road key that extends `tail`, if the list carries one. */
const roadKeys = [...roads.keys()];
function extension(tail: string): string | undefined {
  let best: string | undefined;
  for (const road of roadKeys) {
    if (road.length > tail.length && road.startsWith(tail) && (!best || road.length > best.length))
      best = road;
  }
  return best;
}

describe("official data round-trips through parse()", () => {
  it("every road name comes back out of a full address intact", () => {
    const rows = csvRows(readSource("roads.csv")).slice(1);
    expect(rows.length).toBeGreaterThan(30_000);
    const failures: string[] = [];
    for (const [rawZh] of rows) {
      const zh = normalizeSections(normalizeZh(rawZh));
      const result = parse(`${WHERE}${zh}1號`);
      if (!result.ok) {
        failures.push(`${rawZh}: ${result.error.code}`);
        continue;
      }
      const got = roadish(result.parts);
      if (got !== zh || result.parts.number !== "1") {
        failures.push(`${rawZh}: got "${got}" number=${result.parts.number}`);
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
    expect(failures).toHaveLength(0);
  });

  it("every village name survives a road following it", () => {
    // The village slot is skipped entirely by the road replay above, and it is
    // where the dictionary is most likely to collide with a road name.
    const rows = csvRows(readSource("villages.csv")).filter(([zh]) => /[村里]$/.test(zh));
    expect(rows.length).toBeGreaterThan(5_000);
    const failures: string[] = [];
    for (const [rawZh] of rows) {
      const zh = normalizeZh(rawZh);
      const result = parse(`${WHERE}${zh}忠孝東路1號`);
      if (!result.ok) {
        failures.push(`${rawZh}: ${result.error.code}`);
        continue;
      }
      const { village, road, number } = result.parts;
      if (village !== zh || road !== "忠孝東路" || number !== "1") {
        failures.push(`${rawZh}: village=${village} road=${road} number=${number}`);
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
    expect(failures).toHaveLength(0);
  });

  describe("compound village+road keys", () => {
    it("exist in the shipped data, or the two tests below prove nothing", () => {
      expect(compound.length).toBeGreaterThan(200);
    });

    it("stay whole when nothing longer follows", () => {
      // 塘興村坪頂東巷 is 塘興村坪頂 + 東巷 lane: splitting at the village would
      // read 坪頂東 — one character further — and orphan the 巷.
      const failures: string[] = [];
      for (const [head, tail] of compound) {
        const key = head + tail;
        const result = parse(`${WHERE}${key}1號`);
        if (!result.ok) {
          failures.push(`${key}: ${result.error.code}`);
          continue;
        }
        const got = roadish(result.parts);
        if (got !== key || result.parts.number !== "1") {
          failures.push(`${key}: got "${got}" number=${result.parts.number}`);
        }
      }
      expect(failures.slice(0, 20)).toEqual([]);
      expect(failures).toHaveLength(0);
    });

    it("give the village up when a longer real road follows", () => {
      // 福星里福星北一街 is 福星里 + 福星北一街, not the compound key with
      // 北一街 left stranded.
      const failures: string[] = [];
      let checked = 0;
      for (const [head, tail] of compound) {
        const longer = extension(tail);
        if (!longer) continue;
        checked++;
        const result = parse(`${WHERE}${head}${longer}1號`);
        if (!result.ok) {
          failures.push(`${head}+${longer}: ${result.error.code}`);
          continue;
        }
        const { village, road, number } = result.parts;
        if (village !== head || road !== longer || number !== "1") {
          failures.push(`${head}+${longer}: village=${village} road=${road} number=${number}`);
        }
      }
      expect(checked).toBeGreaterThan(100);
      expect(failures.slice(0, 20)).toEqual([]);
      expect(failures).toHaveLength(0);
    });
  });
});
