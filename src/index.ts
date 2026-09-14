import { format } from "./format.js";
import { parse } from "./parse.js";
import type { FormatOptions, FormatResult } from "./types.js";

export { format } from "./format.js";
export { parse } from "./parse.js";
export type {
  AddressParts,
  Confidence,
  FormatOptions,
  FormatResult,
  FormatSegment,
  ParseError,
  ParseErrorCode,
  ParseResult,
  ParseWarning,
  ParseWarningCode,
  Romanization,
} from "./types.js";

/**
 * `parse` followed by `format`. When the input cannot be parsed the result has
 * `confidence: "unknown"`, an empty `english`, and the whole input in `unresolved`.
 */
export function translate(input: string, options?: FormatOptions): FormatResult {
  const parsed = parse(input);
  if (!parsed.ok) return { english: "", confidence: "unknown", segments: [], unresolved: [input] };
  const result = format(parsed.parts, options);
  if (parsed.unparsed.length > 0) {
    result.unresolved.push(parsed.unparsed);
    result.confidence = "unknown";
  }
  return result;
}
