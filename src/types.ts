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
  /** Floor (樓 / F), e.g. `"3"`. Basement levels carry a `B`: `"B1"` prints as `B1 F.`. */
  floor?: string;
  /** Floor suffix (之): the `2` in `3樓之2`. May be a letter: `"B"` in `3樓之B`. */
  floorSuffix?: string;
  /** Room (室), e.g. `"5"`. May be a letter: `"A"`, `"A1"`. */
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
  /**
   * Why the input could not be parsed. Set by `translate` only, and only when
   * `english` is `""`. `format` never sets it, since it is given parts rather
   * than text.
   */
  error?: ParseError;
  /**
   * Notes raised while parsing: renamed counties, an inferred city, a postal
   * code that does not match the district. Set by `translate` only, and omitted
   * when there are none. `format` never sets it.
   */
  warnings?: ParseWarning[];
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
  /**
   * The input fragment this warning is about: the outdated name, the district
   * the city was inferred from, the postal code that did not match, or the text
   * that could not be interpreted.
   *
   * It is what makes a warning actionable without reading `message` — in
   * particular it is how you tell a fragment the library *guessed* at from one
   * it *skipped*, since both appear in `FormatResult.unresolved`.
   */
  text?: string;
  /**
   * What the library used in its place, where that makes sense: the current
   * name for an outdated one, the city inferred from a district, or the postal
   * code the district actually has. Absent for `unparsed-remainder`, which has
   * no replacement.
   */
  resolved?: string;
}

export type ParseErrorCode = "empty-input" | "city-not-found" | "area-ambiguous";

export interface ParseError {
  code: ParseErrorCode;
  message: string;
  /**
   * For `area-ambiguous`: the city names the district could belong to, in the
   * official order. Structured so a caller can offer the choice instead of
   * asking the user to parse an English sentence.
   */
  candidates?: string[];
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
