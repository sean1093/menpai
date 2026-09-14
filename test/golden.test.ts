/**
 * Golden cases against the official Chunghwa Post English translation.
 *
 * `expected` is filled in by hand from https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=207
 * (the tool requires a human to operate it). Cases whose `expected` is still
 * `null` are reported as todo and never assert anything.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translate } from "../src/index.js";
import type { Romanization } from "../src/types.js";

interface GoldenCase {
  input: string;
  expected: string | null;
  romanization: Romanization;
  note: string;
}

const ROMANIZATIONS: Romanization[] = ["hanyu", "tongyong", "wade-giles"];

function isGoldenCase(value: unknown): value is GoldenCase {
  if (!value || typeof value !== "object") return false;
  if (!("input" in value) || typeof value.input !== "string") return false;
  if (!("expected" in value) || (value.expected !== null && typeof value.expected !== "string"))
    return false;
  if (!("romanization" in value) || !ROMANIZATIONS.some((r) => r === value.romanization))
    return false;
  return "note" in value && typeof value.note === "string";
}

const raw: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/golden.json", import.meta.url), "utf8"),
);
const cases: GoldenCase[] = Array.isArray(raw) ? raw.filter(isGoldenCase) : [];

describe("golden: official Chunghwa Post output", () => {
  for (const c of cases) {
    const name = `${c.input} [${c.romanization}] — ${c.note}`;
    if (c.expected === null) {
      it.todo(name);
      continue;
    }
    it(name, () => {
      const r = translate(c.input, { romanization: c.romanization });
      expect(r.english).toBe(c.expected);
      expect(r.confidence).toBe("exact");
    });
  }

  it("fixture file is well-formed", () => {
    expect(Array.isArray(raw) ? raw.length : 0).toBe(cases.length);
    expect(cases.length).toBeGreaterThanOrEqual(100);
  });
});
