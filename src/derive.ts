import { type CharLookup, romanizeChars } from "./romanize.js";
import { ordinal, ZH_NUMERAL_CLASS, zhNumeralToInt } from "./text.js";

const ROAD_SUFFIX: Record<string, string> = {
  大道: "Blvd.",
  路: "Rd.",
  街: "St.",
  巷: "Ln.",
  弄: "Aly.",
};

const DIRECTION: Record<string, string> = { 東: "E.", 西: "W.", 南: "S.", 北: "N." };

export const AREA_SUFFIX: Record<string, string> = {
  區: "Dist.",
  鄉: "Township",
  鎮: "Township",
  市: "City",
};

export interface Derived {
  en: string;
  /** Characters with no pinyin reading (kept verbatim in `en`). */
  unknown: string[];
}

const ROAD_TOKEN = /(.+?)(大道|路|街|巷|弄)(?:(\d+)段)?/y;
const ROAD_OR_VILLAGE_TOKEN = /(.+?)(大道|路|街|巷|弄|村|里)(?:(\d+)段)?/y;
const ALL_SUFFIX: Record<string, string> = { ...ROAD_SUFFIX, 村: "Vil.", 里: "Vil." };

interface Token {
  name: string;
  suffix: string;
  section: number | null;
}

function tokenize(zh: string, pattern: RegExp): Token[] | null {
  const tokens: Token[] = [];
  pattern.lastIndex = 0;
  let pos = 0;
  while (pos < zh.length) {
    const m = pattern.exec(zh);
    if (!m || m[1] === undefined || m[2] === undefined) break;
    tokens.push({ name: m[1], suffix: m[2], section: m[3] ? Number(m[3]) : null });
    pos = pattern.lastIndex;
  }
  return pos === zh.length && tokens.length > 0 ? tokens : null;
}

/**
 * Rule-based English for a Chinese place / road name, mirroring the Chunghwa Post
 * conventions: `忠孝東路` → `Zhongxiao E. Rd.`, `民族一路` → `Minzu 1st Rd.`,
 * `中正路中正巷` → `Zhongzheng Ln., Zhongzheng Rd.`, `遊園路1段七十二北巷` →
 * `Qishi'er N. Ln., Sec. 1, Youyuan Rd.`, `三成村上林路` → `Shanglin Rd., Sancheng Vil.`.
 * A name without any road-type suffix (`下寮`) is plain pinyin (`Xialiao`).
 *
 * Section digits inside composite names must already be half-width.
 */
export function deriveRoadEnglish(zh: string, lookup: CharLookup): Derived {
  const tokens = tokenize(zh, ROAD_OR_VILLAGE_TOKEN) ?? tokenize(zh, ROAD_TOKEN);
  if (!tokens) {
    const plain = romanizeChars(zh, lookup);
    return { en: plain.text, unknown: plain.unknown };
  }
  const unknown: string[] = [];
  const parts: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (!token) continue;
    const named = deriveNamed(token.name, lookup);
    unknown.push(...named.unknown);
    const en = `${named.en} ${ALL_SUFFIX[token.suffix]}`;
    parts.push(token.section === null ? en : `Sec. ${token.section}, ${en}`);
  }
  return { en: parts.join(", "), unknown };
}

const TRAILING_NUMERAL = new RegExp(`^(.+?)([${ZH_NUMERAL_CLASS}]+)$`);

/**
 * Name without its suffix: strips a trailing ordinal numeral, then a direction,
 * and emits `<Pinyin> <E.|W.|S.|N.> <1st|2nd|…>`: `三光北一` → `Sanguang N. 1st`.
 */
export function deriveNamed(name: string, lookup: CharLookup): Derived {
  let stem = name;
  let ordinalWord = "";
  const numeral = TRAILING_NUMERAL.exec(stem);
  if (numeral && numeral[1] !== undefined && numeral[2] !== undefined) {
    const n = zhNumeralToInt(numeral[2]);
    if (n !== null && n > 0) {
      ordinalWord = ordinal(n);
      stem = numeral[1];
    }
  }
  let direction = "";
  const last = stem.charAt(stem.length - 1);
  if (stem.length >= 3 && DIRECTION[last]) {
    direction = DIRECTION[last] ?? "";
    stem = stem.slice(0, -1);
  }
  const { text, unknown } = romanizeChars(stem, lookup);
  let en = text;
  if (direction) en += ` ${direction}`;
  if (ordinalWord) en += ` ${ordinalWord}`;
  return { en, unknown };
}

/** `豊收村` → `Fengshou Vil.` */
export function deriveVillageEnglish(zh: string, lookup: CharLookup): Derived {
  const stem = /[村里]$/.test(zh) ? zh.slice(0, -1) : zh;
  const { text, unknown } = romanizeChars(stem, lookup);
  return { en: `${text} Vil.`, unknown };
}

/** `新竹市東區` is conventional; this is the fallback for unknown areas: `某某區` → `Moumou Dist.` */
export function deriveAreaEnglish(zh: string, lookup: CharLookup): Derived {
  const last = zh.charAt(zh.length - 1);
  const suffix = AREA_SUFFIX[last];
  const stem = suffix ? zh.slice(0, -1) : zh;
  const { text, unknown } = romanizeChars(stem, lookup);
  return { en: suffix ? `${text} ${suffix}` : text, unknown };
}
