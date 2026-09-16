import {
  type Area,
  areasNamed,
  areasOfCity,
  CITY_ALIASES,
  cityAt,
  findCity,
  longestPrefix,
  roadEntry,
  villageEntry,
} from "./dict.js";
import { normalizeSections, normalizeZh, ZH_NUMERAL_CLASS, zhNumeralToInt } from "./text.js";
import type { AddressParts, ParseResult, ParseWarning } from "./types.js";

const NUM = `[0-9${ZH_NUMERAL_CLASS}]+`;
/**
 * A unit designator: a number, or a Latin letter optionally carrying up to two
 * digits (`A室`, `A1室`, `3樓之B`). Deliberately narrow — the trailing lookahead
 * stops it reaching into a building name, so `AB室`, `A123室` and `3樓之B棟` do
 * not match and are reported rather than half-read.
 */
const UNIT = `(?:${NUM}|[A-Za-z][0-9]{0,2}(?![0-9A-Za-z棟座館區]))`;
const NEIGHBORHOOD = new RegExp(`^(${NUM})鄰`);
const NUMERIC_SECTION = /^(\d+)段/;
const NAMED_SECTION = /^([^0-9巷弄號樓之鄰室]{1,4})段/;
const NUMERIC_LANE = new RegExp(`^(${NUM})巷`);
const NAMED_LANE = /^([^0-9弄號樓之鄰室]{1,8}巷)/;
const ALLEY = new RegExp(`^(${NUM})弄`);
const SUB_ALLEY = new RegExp(`^(${NUM})衖`);
const NUMBER = new RegExp(`^(${NUM})(?:之(${NUM})|-(${NUM}))?號(?:之(${NUM}))?`);
const FLOOR = new RegExp(`^(${NUM})(?:樓|F)(?:之(${UNIT})|-(${UNIT}))?`, "i");
/** `地下2樓`, `地下二樓之3`, `B2F`, `B2樓`, `地下2層` — an explicit 樓/F/層 settles it. */
const BASEMENT_MARKED = new RegExp(
  `^(?:地下|B)(${NUM})(?:樓|F|層)(?:之(${UNIT})|-(${UNIT}))?`,
  "i",
);
/**
 * Bare `B2` / `地下2`, with no 樓/F/層 to confirm it. `B2` is also how buildings
 * label a block (`B1棟`, `B2號`, `B25室`, `b2c咖啡`), and claiming a basement
 * there would invent a floor and discard the real one. So the bare form is only
 * read as a floor when it ends the address, or is followed by a separated room.
 */
const BASEMENT_BARE = new RegExp(
  `^(?:地下|B)(${NUM})(?:之(${UNIT})|-(${UNIT}))?(?=$|\\s+${UNIT}室)`,
  "i",
);
const ROOM = new RegExp(`^(${UNIT})室`);
const VILLAGE = /^([^0-9巷弄號段路街鄰]{1,6}[村里])/;
const ROAD_FALLBACK = /^([^0-9]{1,12}?(?:大道|路|街|巷|弄))/;
const AREA_SUFFIX = /[市鄉鎮區]$/;

/** Consumes `length` characters plus any whitespace that follows. */
function advance(text: string, length: number): string {
  return text.slice(length).replace(/^\s+/, "");
}

/** `"十二"` → `"12"`, `"12"` → `"12"`. Callers only pass text matched by `NUM`. */
function digits(text: string): string {
  if (/^\d+$/.test(text)) return String(Number(text));
  const n = zhNumeralToInt(text);
  return n === null ? text : String(n);
}

/** A unit designator matched by {@link UNIT}: a number, or a letter kept upper-case. */
function unit(text: string): string {
  return /^[A-Za-z]/.test(text) ? text.toUpperCase() : digits(text);
}

interface Located {
  cityIndex: number;
  area: Area | undefined;
  consumed: number;
}

/** Matches an area of `cityIndex` at the start of `text`, tolerating an outdated suffix (板橋市 → 板橋區). */
function matchArea(
  text: string,
  cityIndex: number,
  warnings: ParseWarning[],
): { area: Area; length: number } | undefined {
  let best: { area: Area; length: number; alias: boolean } | undefined;
  for (const area of areasOfCity(cityIndex)) {
    if (area.zh === "") continue;
    if (text.startsWith(area.zh)) {
      if (!best || area.zh.length > best.length || best.alias)
        best = { area, length: area.zh.length, alias: false };
      continue;
    }
    const stem = area.zh.slice(0, -1);
    if (
      AREA_SUFFIX.test(area.zh) &&
      text.startsWith(stem) &&
      AREA_SUFFIX.test(text.charAt(stem.length)) &&
      (!best || (best.alias && area.zh.length > best.length))
    ) {
      best = { area, length: area.zh.length, alias: true };
    }
  }
  if (!best) return undefined;
  if (best.alias) {
    warnings.push({
      code: "area-alias",
      message: `"${text.slice(0, best.length)}" was read as "${best.area.zh}".`,
    });
  }
  return { area: best.area, length: best.length };
}

function locate(
  text: string,
  postalCode: string | undefined,
  warnings: ParseWarning[],
): Located | ParseResult {
  const cityToken = text.slice(0, 3);
  const alias = CITY_ALIASES[cityToken];
  const city = findCity(alias ?? cityToken);
  if (city) {
    if (alias) {
      warnings.push({ code: "city-alias", message: `"${cityToken}" was read as "${alias}".` });
    }
    const afterCity = text.slice(3).replace(/^\s+/, "");
    const skipped = text.length - 3 - afterCity.length;
    const area = matchArea(afterCity, city.index, warnings);
    return { cityIndex: city.index, area: area?.area, consumed: 3 + skipped + (area?.length ?? 0) };
  }
  // No city: try to infer it from a uniquely named area.
  let candidates: Area[] = [];
  for (let len = Math.min(6, text.length); len >= 2; len--) {
    candidates = areasNamed(text.slice(0, len));
    if (candidates.length > 0) break;
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      error: {
        code: "city-not-found",
        message: "No city or county found at the start of the address.",
      },
    };
  }
  if (candidates.length > 1 && postalCode) {
    candidates = candidates.filter((a) => a.zip === postalCode.slice(0, 3));
  }
  const first = candidates[0];
  if (candidates.length !== 1 || !first) {
    const cities = candidates.map((a) => cityAt(a.city)?.zh ?? "").join(", ");
    return {
      ok: false,
      error: {
        code: "area-ambiguous",
        message: `"${text.slice(0, 3)}" exists in more than one city (${cities}); add the city name or a postal code.`,
      },
    };
  }
  warnings.push({
    code: "city-inferred-from-area",
    message: `City "${cityAt(first.city)?.zh ?? ""}" was inferred from "${first.zh}".`,
  });
  return { cityIndex: first.city, area: first, consumed: first.zh.length };
}

/**
 * Parses a Traditional Chinese address into {@link AddressParts}.
 *
 * Accepts `臺`/`台` variants, full-width digits, Chinese numerals (`四段`, `十二樓`),
 * `3F` for `3樓`, basement floors (`地下2樓`, `B2F`), lettered units (`A室`, `3樓之B`),
 * `1-1號` / `1之1號`, 3 / 3+2 / 3+3
 * postal codes, and whitespace anywhere. Fails only when no city can be determined;
 * anything after the last recognised part is returned in `unparsed`.
 */
export function parse(input: string): ParseResult {
  let rest = normalizeZh(input);
  if (rest.length === 0)
    return { ok: false, error: { code: "empty-input", message: "Input is empty." } };
  const warnings: ParseWarning[] = [];
  const parts: AddressParts = {};

  const zip = /^(\d{3})(?:-?(\d{3}|\d{2}))?(?![0-9])/.exec(rest);
  if (zip?.[1]) {
    parts.postalCode = zip[1] + (zip[2] ?? "");
    rest = advance(rest, zip[0].length);
  }

  const located = locate(rest, parts.postalCode, warnings);
  if ("ok" in located) return located;
  const city = cityAt(located.cityIndex);
  if (!city)
    return { ok: false, error: { code: "city-not-found", message: "No city or county found." } };
  parts.city = city.zh;
  if (located.area) parts.area = located.area.zh;
  rest = advance(rest, located.consumed);

  if (parts.postalCode) {
    const zip3 = parts.postalCode.slice(0, 3);
    const expected = located.area ? [located.area.zip] : areasOfCity(city.index).map((a) => a.zip);
    if (!expected.includes(zip3)) {
      warnings.push({
        code: "postal-code-mismatch",
        message: `Postal code ${zip3} does not belong to ${parts.area ?? parts.city}${
          located.area ? ` (expected ${located.area.zip})` : ""
        }.`,
      });
    }
  }

  rest = normalizeSections(rest);

  // Village: dictionary first, then shape. A longer road-dictionary hit wins (七里橋 is a road, not 七里 village).
  const villageHit = longestPrefix(rest, villageEntry) ?? VILLAGE.exec(rest)?.[1];
  if (villageHit) {
    const roadHit = longestPrefix(rest, roadEntry);
    if (!roadHit || roadHit.length <= villageHit.length) {
      parts.village = villageHit;
      rest = advance(rest, villageHit.length);
    }
  }

  const neighborhood = NEIGHBORHOOD.exec(rest);
  if (neighborhood?.[1]) {
    parts.neighborhood = digits(neighborhood[1]);
    rest = advance(rest, neighborhood[0].length);
  }

  const road = longestPrefix(rest, roadEntry) ?? ROAD_FALLBACK.exec(rest)?.[1];
  if (road) {
    parts.road = road;
    rest = advance(rest, road.length);
  }

  const section = NUMERIC_SECTION.exec(rest) ?? NAMED_SECTION.exec(rest);
  if (section?.[1]) {
    parts.section = section[1];
    rest = advance(rest, section[0].length);
  }

  const lane = NUMERIC_LANE.exec(rest);
  if (lane?.[1]) {
    parts.lane = digits(lane[1]);
    rest = advance(rest, lane[0].length);
  } else {
    const named =
      longestPrefix(rest, (zh) => (zh.endsWith("巷") ? roadEntry(zh) : undefined)) ??
      NAMED_LANE.exec(rest)?.[1];
    if (named) {
      parts.lane = named;
      rest = advance(rest, named.length);
    }
  }

  const alley = ALLEY.exec(rest);
  if (alley?.[1]) {
    parts.alley = digits(alley[1]);
    rest = advance(rest, alley[0].length);
  }

  const subAlley = SUB_ALLEY.exec(rest);
  if (subAlley?.[1]) {
    parts.subAlley = digits(subAlley[1]);
    rest = advance(rest, subAlley[0].length);
  }

  const number = NUMBER.exec(rest);
  if (number?.[1]) {
    parts.number = digits(number[1]);
    const suffix = number[2] ?? number[3] ?? number[4];
    if (suffix) parts.numberSuffix = digits(suffix);
    rest = advance(rest, number[0].length);
  }

  const basement = BASEMENT_MARKED.exec(rest) ?? BASEMENT_BARE.exec(rest);
  const floor = basement ?? FLOOR.exec(rest);
  if (floor?.[1]) {
    parts.floor = (basement ? "B" : "") + digits(floor[1]);
    const suffix = floor[2] ?? floor[3];
    if (suffix) parts.floorSuffix = unit(suffix);
    rest = advance(rest, floor[0].length);
  }

  const room = ROOM.exec(rest);
  if (room?.[1]) {
    parts.room = unit(room[1]);
    rest = advance(rest, room[0].length);
  }

  if (rest.length > 0) {
    warnings.push({ code: "unparsed-remainder", message: `Could not interpret "${rest}".` });
  }
  return { ok: true, parts, unparsed: rest, warnings };
}
