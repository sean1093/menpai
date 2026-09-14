/**
 * Every entry of the vendored Chunghwa Post files must come back out of `format()`
 * byte-for-byte. This pins the derivation rules to the official data: a rule
 * change that alters any known road, village, or district fails here.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { roadEntry } from "../src/dict.js";
import { format } from "../src/index.js";
import { normalizeSections, normalizeZh } from "../src/text.js";

const read = (name: string) =>
  readFileSync(new URL(`../data/source/${name}`, import.meta.url), "utf8");

function csvRows(text: string): [string, string][] {
  const rows: [string, string][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^"|"$/g, "");
    if (!line) continue;
    const comma = line.indexOf(",");
    if (comma === -1) continue;
    const zh = line.slice(0, comma);
    const en = line
      .slice(comma + 1)
      .replace(/^"+|"+$/g, "")
      .replace(/""/g, '"');
    rows.push([zh, en]);
  }
  return rows;
}

const normalizeEn = (en: string) =>
  en
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("official data round-trips through format()", () => {
  it("roads (中英文街路名稱對照檔)", () => {
    const rows = csvRows(read("roads.csv")).slice(1);
    expect(rows.length).toBeGreaterThan(30000);
    const failures: string[] = [];
    for (const [rawZh, rawEn] of rows) {
      const zh = normalizeSections(normalizeZh(rawZh));
      const en = normalizeEn(rawEn);
      // Same choice the parser makes: the longest dictionary key wins, so a
      // sectioned entry with its own English (大學路一段 → University Road) is
      // used whole; otherwise the section is split off the base road.
      const m = /^(.+?)(\d+)段$/.exec(zh);
      const parts =
        roadEntry(zh) === undefined && m?.[1] !== undefined && m[2] !== undefined
          ? { road: m[1], section: m[2] }
          : { road: zh };
      const r = format(parts, { country: false });
      if (r.english !== en || r.confidence !== "exact")
        failures.push(`${rawZh}: expected "${en}", got "${r.english}" (${r.confidence})`);
    }
    expect(failures).toEqual([]);
  });

  it("villages (村里文字巷中英對照檔)", () => {
    const rows = csvRows(read("villages.csv")).filter(([zh]) => /[村里]$/.test(zh));
    expect(rows.length).toBeGreaterThan(5000);
    const failures: string[] = [];
    for (const [rawZh, rawEn] of rows) {
      const r = format({ village: normalizeZh(rawZh) }, { country: false });
      const en = normalizeEn(rawEn);
      if (r.english !== en || r.confidence !== "exact")
        failures.push(`${rawZh}: expected "${en}", got "${r.english}" (${r.confidence})`);
    }
    expect(failures).toEqual([]);
  });

  it("cities and districts (縣市鄉鎮中英對照檔)", () => {
    const xml = read("county.xml");
    const failures: string[] = [];
    let count = 0;
    for (const m of xml.matchAll(
      /<欄位1>(\d+)<\/欄位1>\s*<欄位2>([^<]+)<\/欄位2>\s*<欄位3>([^<]*)<\/欄位3>/g,
    )) {
      const [, zip = "", zh = "", rawEn = ""] = m;
      const en = normalizeEn(rawEn);
      if (zh.trim().length <= 3) continue; // 釣魚台: no district
      count++;
      const r = format({ city: zh.slice(0, 3), area: zh.slice(3) }, { country: false });
      const expected = `${en} ${zip}`;
      if (r.english !== expected || r.confidence !== "exact")
        failures.push(`${zh}: expected "${expected}", got "${r.english}" (${r.confidence})`);
    }
    expect(count).toBeGreaterThan(360);
    expect(failures).toEqual([]);
  });
});
