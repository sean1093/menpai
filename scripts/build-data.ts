/**
 * Generates `src/data/*.ts` from the vendored Chunghwa Post files in `data/source/`.
 *
 * Run with `npm run build:data`. The output is committed; the runtime never reads
 * these source files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pinyin } from "pinyin-pro";
import { encodeChars, encodeList } from "../src/codec.js";
import { deriveRoadEnglish, deriveVillageEnglish } from "../src/derive.js";
import { normalizeSections, normalizeZh, zhNumeralToInt } from "../src/text.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "data", "source");
const outDir = join(root, "src", "data");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const row: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line.charAt(i);
      if (quoted) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') {
            field += '"';
            i++;
          } else quoted = false;
        } else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else field += ch;
    }
    row.push(field);
    rows.push(row.map((f) => f.trim()));
  }
  return rows;
}

const normalizeEnglish = (en: string) =>
  en
    .replace(/[\u2019\u2018]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const ZH_NUMERAL = "〇零一二三四五六七八九十百";
const SECTION_KEY = new RegExp(`^(.+?)([${ZH_NUMERAL}]+)段$`);
const normalizeKey = (zh: string) => normalizeSections(normalizeZh(zh));

// ---------------------------------------------------------------------------
// 1. Source files
// ---------------------------------------------------------------------------
const roadRows = parseCsv(readFileSync(join(sourceDir, "roads.csv"), "utf8")).slice(1);
// The village file wraps each whole line in quotes: `"一心里,""Yixin Vil."""`.
const villageRows = parseCsv(readFileSync(join(sourceDir, "villages.csv"), "utf8")).map((row) => {
  if (row.length !== 1) return row;
  const comma = (row[0] ?? "").indexOf(",");
  if (comma === -1) return row;
  return [(row[0] ?? "").slice(0, comma), (row[0] ?? "").slice(comma + 1).replace(/^"|"$/g, "")];
});
const countyXml = readFileSync(join(sourceDir, "county.xml"), "utf8");

const rawRoads = new Map<string, string>();
for (const [zh, en] of roadRows) {
  if (!zh || !en) continue;
  const key = normalizeZh(zh);
  const value = normalizeEnglish(en);
  const existing = rawRoads.get(key);
  if (existing !== undefined && existing !== value)
    console.warn(`roads: conflicting entry ${key}: "${existing}" vs "${value}"`);
  rawRoads.set(key, value);
}

const rawVillages = new Map<string, string>();
for (const [zh, en] of villageRows) {
  if (!zh || !en) continue;
  const key = normalizeZh(zh);
  const value = normalizeEnglish(en);
  if (/[村里]$/.test(key)) rawVillages.set(key, value);
  else if (!rawRoads.has(key)) rawRoads.set(key, value);
  else if (rawRoads.get(key) !== value)
    console.warn(
      `villages: "${key}" differs from roads file: "${value}" vs "${rawRoads.get(key)}"`,
    );
}

// ---------------------------------------------------------------------------
// 2. Character readings: all Big5 hanzi plus every character used by the data.
// ---------------------------------------------------------------------------
const chars = new Set<string>();
const big5 = new TextDecoder("big5");
for (let hi = 0xa4; hi <= 0xf9; hi++) {
  for (let lo = 0x40; lo <= 0xfe; lo++) {
    if (lo === 0x7f || (lo > 0x7e && lo < 0xa1)) continue;
    const ch = big5.decode(new Uint8Array([hi, lo]));
    if (/^[\u3400-\u9fff\u{20000}-\u{2ffff}]$/u.test(ch)) chars.add(ch);
  }
}
for (const key of [...rawRoads.keys(), ...rawVillages.keys()])
  for (const ch of key) if (/\p{Script=Han}/u.test(ch)) chars.add(ch);
for (const m of countyXml.matchAll(/<欄位2>([^<]+)</g))
  for (const ch of m[1] ?? "") if (/\p{Script=Han}/u.test(ch)) chars.add(ch);

const readings = new Map<string, string>();
for (const ch of chars) {
  const reading = pinyin(ch, { toneType: "none", type: "array" })[0];
  if (reading && /^[a-z]+$/.test(reading) && reading !== ch) readings.set(ch, reading);
}
const lookup = (ch: string) => readings.get(ch);

// ---------------------------------------------------------------------------
// 3. Roads: fold "Sec. N, X" entries into their base, keep only rule-defying entries as overrides.
// ---------------------------------------------------------------------------
const roads = new Map<string, string>();
const sectionFolded = { dropped: 0, addedBase: 0, kept: 0 };
/** `忠孝東路四段` + `Sec. 4, Zhongxiao E. Rd.` → base `忠孝東路` and the English without its section prefix. */
function splitSection(zh: string, en: string): { base: string; rest: string } | null {
  const m = SECTION_KEY.exec(zh);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const n = zhNumeralToInt(m[2]);
  const prefix = `Sec. ${n}, `;
  if (n === null || !en.startsWith(prefix)) return null;
  return { base: m[1], rest: en.slice(prefix.length) };
}
for (const [zh, en] of rawRoads) {
  const split = splitSection(zh, en);
  if (split && !rawRoads.has(split.base)) {
    rawRoads.set(split.base, split.rest);
    sectionFolded.addedBase++;
  }
}
for (const [zh, en] of rawRoads) {
  const split = splitSection(zh, en);
  if (split) {
    if (rawRoads.get(split.base) === split.rest) {
      sectionFolded.dropped++;
      continue;
    }
    sectionFolded.kept++;
  }
  const key = normalizeKey(zh);
  const derived = deriveRoadEnglish(key, lookup);
  roads.set(key, derived.en === en ? "" : en);
}

const villages = new Map<string, string>();
for (const [zh, en] of rawVillages) {
  const derived = deriveVillageEnglish(zh, lookup);
  villages.set(zh, derived.en === en ? "" : en);
}

// ---------------------------------------------------------------------------
// 4. Cities and areas from the county XML.
// ---------------------------------------------------------------------------
interface Area {
  city: number;
  zh: string;
  en: string;
  zip: string;
  cityEn?: string;
}
const cities: { zh: string; en: string }[] = [];
const areas: Area[] = [];
for (const m of countyXml.matchAll(
  /<欄位1>(\d+)<\/欄位1>\s*<欄位2>([^<]+)<\/欄位2>\s*<欄位3>([^<]*)<\/欄位3>/g,
)) {
  const [, zip = "", rawZh = "", rawEn = ""] = m;
  const zh = normalizeZh(rawZh);
  const en = normalizeEnglish(rawEn);
  if (zh.length <= 3) {
    // Standalone entry such as 釣魚台: a city with no area.
    if (!cities.some((c) => c.zh === zh)) cities.push({ zh, en });
    areas.push({ city: cities.findIndex((c) => c.zh === zh), zh: "", en: "", zip });
    continue;
  }
  const cityZh = zh.slice(0, 3);
  const areaZh = zh.slice(3);
  const comma = en.lastIndexOf(", ");
  const areaEn = comma === -1 ? en : en.slice(0, comma);
  const cityEn = comma === -1 ? "" : en.slice(comma + 2);
  let cityIdx = cities.findIndex((c) => c.zh === cityZh);
  if (cityIdx === -1) {
    cities.push({ zh: cityZh, en: cityEn });
    cityIdx = cities.length - 1;
  }
  const city = cities[cityIdx];
  const area: Area = { city: cityIdx, zh: areaZh, en: areaEn, zip };
  if (city && cityEn && cityEn !== city.en) area.cityEn = cityEn;
  areas.push(area);
}

// ---------------------------------------------------------------------------
// 5. Emit.
// ---------------------------------------------------------------------------
const header = "// Generated by scripts/build-data.ts from data/source/. Do not edit.\n";
const emit = (name: string, body: string) => writeFileSync(join(outDir, name), header + body);

emit("chars.ts", `export const CHARS = ${JSON.stringify(encodeChars(readings))};\n`);
emit("roads.ts", `export const ROADS = ${JSON.stringify(encodeList(roads))};\n`);
emit("villages.ts", `export const VILLAGES = ${JSON.stringify(encodeList(villages))};\n`);
emit(
  "places.ts",
  `export const CITIES: readonly (readonly [zh: string, en: string])[] = ${JSON.stringify(cities.map((c) => [c.zh, c.en]))};\n` +
    `/** [cityIndex, zh, en, zip3, cityEnOverride?] */\n` +
    `export const AREAS: readonly (readonly [number, string, string, string, string?])[] = ${JSON.stringify(
      areas.map((a) =>
        a.cityEn ? [a.city, a.zh, a.en, a.zip, a.cityEn] : [a.city, a.zh, a.en, a.zip],
      ),
    )};\n`,
);

const overrides = (m: Map<string, string>) => [...m.values()].filter((v) => v !== "").length;
console.log(
  JSON.stringify(
    {
      sourceRoadRows: roadRows.length,
      sourceVillageRows: villageRows.length,
      roads: { entries: roads.size, overrides: overrides(roads), ...sectionFolded },
      villages: { entries: villages.size, overrides: overrides(villages) },
      chars: readings.size,
      cities: cities.length,
      areas: areas.length,
    },
    null,
    2,
  ),
);
