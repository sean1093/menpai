/**
 * Readers for the vendored Chunghwa Post source files under `data/source/`.
 *
 * Shared by the two corpus replays: `data.test.ts` drives the official rows
 * through `format()`, `data-parse.test.ts` drives them through `parse()`.
 */
import { readFileSync } from "node:fs";

export const readSource = (name: string): string =>
  readFileSync(new URL(`../../data/source/${name}`, import.meta.url), "utf8");

/**
 * The official CSVs are one `zh,en` pair per line, variously quoted — some
 * files wrap the whole line, some only the English, and an English name may
 * contain an escaped quote.
 */
export function csvRows(text: string): [string, string][] {
  const rows: [string, string][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^"|"$/g, "");
    if (!line) continue;
    const comma = line.indexOf(",");
    if (comma === -1) continue;
    const zh = line.slice(0, comma);
    const en = line
      .slice(comma + 1)
      .replace(/^"+|"+$/g, "")
      .replace(/""/g, '"');
    rows.push([zh, en]);
  }
  return rows;
}
