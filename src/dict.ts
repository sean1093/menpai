import { decodeChars, decodeList } from "./codec.js";
import { CHARS } from "./data/chars.js";
import { AREAS, CITIES } from "./data/places.js";
import { ROADS } from "./data/roads.js";
import { VILLAGES } from "./data/villages.js";

// All tables are decoded lazily on first use so that importing the package has no
// side effects beyond loading string constants.

let chars: Map<string, string> | undefined;
let roads: Map<string, string> | undefined;
let villages: Map<string, string> | undefined;

/** Hanyu Pinyin reading (toneless) of one character, if known. */
export function charReading(ch: string): string | undefined {
  if (!chars) chars = decodeChars(CHARS);
  return chars.get(ch);
}

/**
 * Road dictionary entry. `""` means the name is known and its English follows
 * the derivation rules; a non-empty string is the official English; `undefined`
 * means the name is not in the Chunghwa Post road list.
 */
export function roadEntry(zh: string): string | undefined {
  if (!roads) roads = decodeList(ROADS);
  return roads.get(zh);
}

export function villageEntry(zh: string): string | undefined {
  if (!villages) villages = decodeList(VILLAGES);
  return villages.get(zh);
}

export const MAX_ROAD_LENGTH = 16;

/** Longest dictionary key that prefixes `text`, or `undefined`. */
export function longestPrefix(
  text: string,
  lookup: (zh: string) => string | undefined,
): string | undefined {
  for (let len = Math.min(MAX_ROAD_LENGTH, text.length); len >= 1; len--) {
    const candidate = text.slice(0, len);
    if (lookup(candidate) !== undefined) return candidate;
  }
  return undefined;
}

export interface City {
  index: number;
  zh: string;
  en: string;
}

export interface Area {
  city: number;
  zh: string;
  en: string;
  zip: string;
  cityEn: string | undefined;
}

/** Pre-2010/2014 county names that were merged into or upgraded to special municipalities. */
export const CITY_ALIASES: Record<string, string> = {
  臺北縣: "新北市",
  桃園縣: "桃園市",
  臺中縣: "臺中市",
  臺南縣: "臺南市",
  高雄縣: "高雄市",
};

export function findCity(zh: string): City | undefined {
  for (let i = 0; i < CITIES.length; i++) {
    const city = CITIES[i];
    if (city && city[0] === zh) return { index: i, zh: city[0], en: city[1] };
  }
  return undefined;
}

export function cityAt(index: number): City | undefined {
  const city = CITIES[index];
  return city ? { index, zh: city[0], en: city[1] } : undefined;
}

export function areasNamed(zh: string): Area[] {
  const out: Area[] = [];
  for (const row of AREAS) {
    if (row[1] === zh)
      out.push({ city: row[0], zh: row[1], en: row[2], zip: row[3], cityEn: row[4] });
  }
  return out;
}

export function areasOfCity(cityIndex: number): Area[] {
  const out: Area[] = [];
  for (const row of AREAS) {
    if (row[0] === cityIndex)
      out.push({ city: row[0], zh: row[1], en: row[2], zip: row[3], cityEn: row[4] });
  }
  return out;
}
