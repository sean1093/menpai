import {
  type Derived,
  deriveAreaEnglish,
  deriveRoadEnglish,
  deriveVillageEnglish,
} from "./derive.js";
import {
  type Area,
  areasOfCity,
  CITY_ALIASES,
  charReading,
  findCity,
  roadEntry,
  villageEntry,
} from "./dict.js";
import { convertRomanization, romanizeChars } from "./romanize.js";
import { normalizeSections, normalizeZh, zhNumeralToInt } from "./text.js";
import type {
  AddressParts,
  Confidence,
  FormatOptions,
  FormatResult,
  FormatSegment,
  Romanization,
} from "./types.js";

const RANK: Record<Confidence, number> = { exact: 2, inferred: 1, unknown: 0 };

function lower(a: Confidence, b: Confidence): Confidence {
  return RANK[a] <= RANK[b] ? a : b;
}

function digits(text: string): string {
  const t = normalizeZh(text);
  if (/^\d+$/.test(t)) return String(Number(t));
  const n = zhNumeralToInt(t);
  return n === null ? t : String(n);
}

interface Resolved {
  en: string;
  confidence: Confidence;
  /** Original Chinese, set when a fallback was used. */
  unresolved?: string;
}

function fromDerived(zh: string, derived: Derived): Resolved {
  return {
    en: derived.en,
    confidence: derived.unknown.length > 0 ? "unknown" : "inferred",
    unresolved: zh,
  };
}

function resolveRoad(zh: string): Resolved {
  const entry = roadEntry(zh);
  if (entry !== undefined) {
    return {
      en: entry === "" ? deriveRoadEnglish(zh, charReading).en : entry,
      confidence: "exact",
    };
  }
  return fromDerived(zh, deriveRoadEnglish(zh, charReading));
}

function resolveVillage(zh: string): Resolved {
  const entry = villageEntry(zh);
  if (entry !== undefined) {
    return {
      en: entry === "" ? deriveVillageEnglish(zh, charReading).en : entry,
      confidence: "exact",
    };
  }
  return fromDerived(zh, deriveVillageEnglish(zh, charReading));
}

/** Area of the city whose name matches, tolerating an outdated suffix (板橋市 → 板橋區). */
function findArea(cityIndex: number, zh: string): Area | undefined {
  const areas = areasOfCity(cityIndex);
  const exact = areas.find((a) => a.zh === zh);
  if (exact) return exact;
  const stem = zh.slice(0, -1);
  return areas.find(
    (a) => a.zh.length === zh.length && a.zh.slice(0, -1) === stem && /[市鄉鎮區]$/.test(a.zh),
  );
}

/**
 * Renders {@link AddressParts} in the Chunghwa Post English order:
 * `Rm. 5, 3 F.-2, No. 1-1, Aly. 27, Ln. 216, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)`.
 */
export function format(parts: AddressParts, options: FormatOptions = {}): FormatResult {
  const romanization: Romanization = options.romanization ?? "hanyu";
  const withCountry = options.country ?? true;
  const segments: FormatSegment[] = [];
  const unresolved: string[] = [];
  let overall: Confidence = "exact";

  const push = (key: keyof AddressParts, resolved: Resolved, convert = false): void => {
    let { en, confidence } = resolved;
    if (convert && romanization !== "hanyu") {
      en = convertRomanization(en, romanization);
      // Wade-Giles output cannot be checked against any official source.
      if (romanization === "wade-giles") confidence = lower(confidence, "inferred");
    }
    if (resolved.unresolved !== undefined) unresolved.push(resolved.unresolved);
    segments.push({ key, value: en, confidence });
    overall = lower(overall, confidence);
  };

  // ---- City / area / postal code -----------------------------------------
  const cityZh = parts.city === undefined ? undefined : normalizeZh(parts.city);
  const city = cityZh === undefined ? undefined : findCity(CITY_ALIASES[cityZh] ?? cityZh);
  const areaZh = parts.area === undefined ? undefined : normalizeZh(parts.area);
  const area = city && areaZh !== undefined ? findArea(city.index, areaZh) : undefined;

  let postal: Resolved | undefined;
  const given =
    parts.postalCode === undefined ? undefined : normalizeZh(parts.postalCode).replace(/\D/g, "");
  if (given) {
    const zip3 = given.slice(0, 3);
    const expected = area ? [area.zip] : city ? areasOfCity(city.index).map((a) => a.zip) : [];
    postal = {
      en: given,
      confidence:
        expected.length === 0 ? "inferred" : expected.includes(zip3) ? "exact" : "unknown",
    };
  } else if (area) {
    postal = { en: area.zip, confidence: "exact" };
  } else if (city) {
    const zips = new Set(areasOfCity(city.index).map((a) => a.zip));
    if (zips.size === 1) postal = { en: [...zips][0] ?? "", confidence: "exact" };
  }
  if (postal && options.postalCode !== undefined && postal.en.length > options.postalCode) {
    postal = { ...postal, en: postal.en.slice(0, options.postalCode) };
  }

  // ---- Small → large ------------------------------------------------------
  if (parts.room !== undefined)
    push("room", { en: `Rm. ${digits(parts.room)}`, confidence: "exact" });
  if (parts.floor !== undefined) {
    const suffix = parts.floorSuffix === undefined ? "" : `-${digits(parts.floorSuffix)}`;
    push("floor", { en: `${digits(parts.floor)} F.${suffix}`, confidence: "exact" });
  }
  if (parts.number !== undefined) {
    const suffix = parts.numberSuffix === undefined ? "" : `-${digits(parts.numberSuffix)}`;
    push("number", { en: `No. ${digits(parts.number)}${suffix}`, confidence: "exact" });
  }
  if (parts.subAlley !== undefined)
    push("subAlley", { en: `Sub-Alley ${digits(parts.subAlley)}`, confidence: "exact" });
  if (parts.alley !== undefined)
    push("alley", { en: `Aly. ${digits(parts.alley)}`, confidence: "exact" });
  if (parts.lane !== undefined) {
    const lane = normalizeSections(normalizeZh(parts.lane));
    if (/^[0-9〇零一二三四五六七八九十百]+$/.test(lane))
      push("lane", { en: `Ln. ${digits(lane)}`, confidence: "exact" });
    else push("lane", resolveRoad(lane.endsWith("巷") ? lane : `${lane}巷`), true);
  }
  if (parts.section !== undefined) {
    const section = normalizeZh(parts.section);
    if (/^[0-9〇零一二三四五六七八九十百]+$/.test(section))
      push("section", { en: `Sec. ${digits(section)}`, confidence: "exact" });
    else
      push(
        "section",
        fromDerived(section, {
          en: `Sec. ${romanizeChars(section, charReading).text}`,
          unknown: romanizeChars(section, charReading).unknown,
        }),
        true,
      );
  }
  if (parts.road !== undefined)
    push("road", resolveRoad(normalizeSections(normalizeZh(parts.road))), true);
  if (parts.neighborhood !== undefined) {
    push("neighborhood", { en: `Neighborhood ${digits(parts.neighborhood)}`, confidence: "exact" });
  }
  if (parts.village !== undefined)
    push("village", resolveVillage(normalizeZh(parts.village)), true);
  if (areaZh !== undefined) {
    if (area) push("area", { en: area.en, confidence: "exact" }, true);
    else push("area", fromDerived(areaZh, deriveAreaEnglish(areaZh, charReading)), true);
  }
  if (cityZh !== undefined) {
    if (city) push("city", { en: area?.cityEn ?? city.en, confidence: "exact" });
    else {
      const suffix = cityZh.endsWith("市") ? " City" : cityZh.endsWith("縣") ? " County" : "";
      const stem = suffix ? cityZh.slice(0, -1) : cityZh;
      const r = romanizeChars(stem, charReading);
      push("city", fromDerived(cityZh, { en: r.text + suffix, unknown: r.unknown }));
    }
  }
  if (postal) push("postalCode", postal);

  // ---- Assemble -----------------------------------------------------------
  const pieces: string[] = [];
  for (const segment of segments) {
    if (
      segment.key === "postalCode" &&
      pieces.length > 0 &&
      segments[segments.length - 2]?.key === "city"
    ) {
      pieces[pieces.length - 1] += ` ${segment.value}`;
    } else pieces.push(segment.value);
  }
  if (withCountry && pieces.length > 0) pieces.push("Taiwan (R.O.C.)");
  if (segments.length === 0) overall = "unknown";
  return { english: pieces.join(", "), confidence: overall, segments, unresolved };
}
