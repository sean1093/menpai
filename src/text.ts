const DIGITS: Record<string, number> = {
  "0": 0,
  〇: 0,
  零: 0,
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

export const ZH_NUMERAL_CLASS = "〇零一二三四五六七八九十百千兩";

/**
 * Converts a Chinese numeral (一, 十二, 二百一十六, 一千零五, 三〇三 ...) to an integer.
 * Returns `null` when the string is not a well-formed numeral.
 */
export function zhNumeralToInt(text: string): number | null {
  if (text.length === 0) return null;
  // Positional form: 三〇三 → 303 (every char is a digit, no 十/百/千).
  if (!/[十百千]/.test(text)) {
    let n = 0;
    for (const ch of text) {
      const d = DIGITS[ch];
      if (d === undefined) return null;
      n = n * 10 + d;
    }
    return n;
  }
  let total = 0;
  let current = 0;
  for (const ch of text) {
    if (ch === "千") {
      total += (current === 0 ? 1 : current) * 1000;
      current = 0;
    } else if (ch === "百") {
      total += (current === 0 ? 1 : current) * 100;
      current = 0;
    } else if (ch === "十") {
      total += (current === 0 ? 1 : current) * 10;
      current = 0;
    } else {
      const d = DIGITS[ch];
      if (d === undefined) return null;
      if (current !== 0) return null;
      current = d;
    }
  }
  return total + current;
}

/** Full-width ASCII (digits, letters, punctuation) → half-width. */
export function toHalfWidth(text: string): string {
  return text.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/*
 * Dashes that mean the same thing as an ASCII hyphen in a house number.
 *
 * `1-1號` is the 附號 form and parses; an en or em dash does not, and the whole
 * house number is then lost — the most delivery-fatal omission there is. They
 * arrive constantly: Word and most web editors autocorrect `-` to an en dash,
 * and PDFs are full of them. Full-width `－` (U+FF0D) is already handled by
 * `toHalfWidth`; every codepoint here sits outside its U+FF01–FF5E range.
 *
 * Built from codepoints on purpose. Written as a literal character class this
 * is `[‐-―−]` — four glyphs nobody can tell apart, with a range operator hiding
 * between two of them. The formatter rewrites `‐` escapes into those
 * glyphs, so numbers are the only form that stays reviewable.
 */
const DASHES = new RegExp(
  `[${[0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]
    .map((code) => String.fromCodePoint(code))
    .join("")}]`,
  "g",
);

/**
 * Canonical form used for every dictionary key and every parsed value:
 * half-width ASCII, `台` written as `臺`, separators (commas, whitespace)
 * removed except a single space between two numerals or letters
 * (`3樓之2, 5室` keeps its boundary as `3樓之2 5室`).
 */
export function normalizeZh(text: string): string {
  return toHalfWidth(text)
    .replace(/台/g, "臺")
    .replace(DASHES, "-")
    .replace(/[\s,、;]+/g, " ")
    .replace(
      /(?<![0-9A-Za-z〇零一二三四五六七八九十百兩]) | (?![0-9A-Za-z〇零一二三四五六七八九十百兩])/g,
      "",
    )
    .trim();
}

/*
 * The run is bounded at 8 because this regex is unanchored and global, and it
 * is applied to the whole remainder of untrusted input. With `+`, a long run of
 * numerals that is never followed by 段 makes the engine retry the greedy run
 * from every start offset: 65,536 digits behind a city name took 2.0 s, and
 * 256 KiB took 34 s — quadratic, from one request.
 *
 * Eight digits is far past `CEILING.section` (99), so nothing real is lost.
 *
 * Note for anyone benchmarking this: the same digits as a one-byte ASCII string
 * run in 0.2 ms, because V8's required-literal scan only applies there. Any
 * fixture for this must carry a CJK character, which is what a real address
 * always has.
 */
const SECTION_NUMERALS = new RegExp(`([0-9${ZH_NUMERAL_CLASS}]{1,8})段`, "g");

/** `四段` / `４段` → `4段` everywhere in the text; other numerals are left alone. */
export function normalizeSections(text: string): string {
  return text.replace(SECTION_NUMERALS, (m, numeral: string) => {
    if (/^\d+$/.test(numeral)) return `${Number(numeral)}段`;
    const n = zhNumeralToInt(numeral);
    return n === null ? m : `${n}段`;
  });
}
