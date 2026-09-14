/**
 * Structured parts of a Taiwan address. All fields are optional; values are
 * kept in their original script (Traditional Chinese for names, ASCII digits
 * for numbers) so that `format()` can look them up.
 */
export interface AddressParts {
  /** Postal code: 3-digit, 3+2 or 3+3 form, digits only (e.g. `"106"`, `"10607"`, `"106070"`). */
  postalCode?: string;
  /** City or county, e.g. `"臺北市"`, `"新竹縣"`. */
  city?: string;
  /** Township / district, e.g. `"大安區"`, `"民雄鄉"`. */
  area?: string;
  /** Village (村/里) including its suffix, e.g. `"豊收村"`. */
  village?: string;
  /** Neighborhood (鄰) number, e.g. `"12"`. */
  neighborhood?: string;
  /** Road / street / boulevard including its suffix, e.g. `"忠孝東路"`, `"重慶北路"`. */
  road?: string;
  /** Section (段) number, e.g. `"4"`. A named section (e.g. `"亞東"`) is also accepted. */
  section?: string;
  /** Lane (巷) number, e.g. `"216"`. A named lane (e.g. `"中正巷"`) is also accepted. */
  lane?: string;
  /** Alley (弄) number, e.g. `"27"`. */
  alley?: string;
  /** Sub-alley (衖) number. */
  subAlley?: string;
  /** House number (號), e.g. `"1"`. */
  number?: string;
  /** House number suffix (附號): the `1` in `1之1號` / `1-1號`. */
  numberSuffix?: string;
  /** Floor (樓 / F), e.g. `"3"`. */
  floor?: string;
  /** Floor suffix (之): the `2` in `3樓之2`. */
  floorSuffix?: string;
  /** Room (室), e.g. `"5"`. */
  room?: string;
}

/**
 * How sure the library is about a piece of output.
 *
 * - `exact`: dictionary hit, or a deterministic rule from the Chunghwa Post guideline.
 * - `inferred`: produced by a fallback (character-level pinyin, suffix rule) and not verified by any dictionary.
 * - `unknown`: could not be translated; the value is passed through and must be checked by a human.
 */
export type Confidence = "exact" | "inferred" | "unknown";

export type Romanization = "hanyu" | "tongyong" | "wade-giles";

export interface FormatOptions {
  /** Romanization system for names not covered by the conventional-spelling table. Default `"hanyu"`. */
  romanization?: Romanization;
  /**
   * Number of postal-code digits to emit. Default: as many as are known (3 unless the input carried a 3+2 / 3+3 code).
   * The library never looks up 3+2 / 3+3 codes; requesting more digits than known emits what is known.
   */
  postalCode?: 3 | 5 | 6;
  /** Append `", Taiwan (R.O.C.)"`. Default `true`. */
  country?: boolean;
}

export interface FormatSegment {
  key: keyof AddressParts;
  /** English rendering of this part, e.g. `"Sec. 4"`, `"Zhongxiao E. Rd."`. */
  value: string;
  confidence: Confidence;
}

export interface FormatResult {
  english: string;
  /** Overall confidence: the lowest confidence of all segments. */
  confidence: Confidence;
  segments: FormatSegment[];
  /** Chinese fragments that were not found in any dictionary and were rendered by a fallback (or left untranslated). */
  unresolved: string[];
}

export type ParseWarningCode =
  | "city-inferred-from-area"
  | "city-alias"
  | "area-alias"
  | "postal-code-mismatch"
  | "unparsed-remainder";

export interface ParseWarning {
  code: ParseWarningCode;
  message: string;
}

export type ParseErrorCode = "empty-input" | "city-not-found" | "area-ambiguous";

export interface ParseError {
  code: ParseErrorCode;
  message: string;
}

export type ParseResult =
  | {
      ok: true;
      parts: AddressParts;
      /** Trailing text that could not be interpreted (building names, notes). Empty when the whole input was consumed. */
      unparsed: string;
      warnings: ParseWarning[];
    }
  | { ok: false; error: ParseError };
