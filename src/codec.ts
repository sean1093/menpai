/**
 * Encoding shared by `scripts/build-data.ts` (encoder) and the runtime (decoder).
 *
 * Name lists are sorted and front-coded: each line is
 * `<shared-prefix-length as one base-36 digit><suffix>[\t<english override>]`.
 * An entry without an override is reproducible by the rule-based derivation.
 */

const MAX_PREFIX = 35;

export function encodeList(entries: ReadonlyMap<string, string>): string {
  const keys = [...entries.keys()].sort();
  const lines: string[] = [];
  let previous = "";
  for (const key of keys) {
    let shared = 0;
    const limit = Math.min(key.length, previous.length, MAX_PREFIX);
    while (shared < limit && key.charCodeAt(shared) === previous.charCodeAt(shared)) shared++;
    const override = entries.get(key) ?? "";
    lines.push(shared.toString(36) + key.slice(shared) + (override ? `\t${override}` : ""));
    previous = key;
  }
  return lines.join("\n");
}

export function decodeList(encoded: string): Map<string, string> {
  const out = new Map<string, string>();
  let previous = "";
  let start = 0;
  while (start < encoded.length) {
    let end = encoded.indexOf("\n", start);
    if (end === -1) end = encoded.length;
    const shared = Number.parseInt(encoded.charAt(start), 36);
    const tab = encoded.indexOf("\t", start);
    const keyEnd = tab !== -1 && tab < end ? tab : end;
    const key = previous.slice(0, shared) + encoded.slice(start + 1, keyEnd);
    out.set(key, keyEnd === end ? "" : encoded.slice(keyEnd + 1, end));
    previous = key;
    start = end + 1;
  }
  return out;
}

/** `syllable:chars` lines → per-character reading table. */
export function decodeChars(encoded: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of encoded.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const syllable = line.slice(0, colon);
    for (const ch of line.slice(colon + 1)) out.set(ch, syllable);
  }
  return out;
}

export function encodeChars(readings: ReadonlyMap<string, string>): string {
  const bySyllable = new Map<string, string[]>();
  for (const [ch, syllable] of readings) {
    const list = bySyllable.get(syllable);
    if (list) list.push(ch);
    else bySyllable.set(syllable, [ch]);
  }
  return [...bySyllable.keys()]
    .sort()
    .map((syllable) => `${syllable}:${(bySyllable.get(syllable) ?? []).sort().join("")}`)
    .join("\n");
}
