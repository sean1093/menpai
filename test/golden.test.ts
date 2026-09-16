/**
 * Golden cases against the official Chunghwa Post English translation.
 *
 * `expected` is filled in by hand from https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=207
 * (the tool requires a human to operate it), together with the date and the
 * source it was read from. See "Contributing a verified case" in the README.
 *
 * Until a case is verified it cannot assert the official spelling — but it can
 * still assert that the input parses, produces a non-empty address, and does not
 * regress in confidence. That part runs for every case, verified or not; only
 * the byte-for-byte comparison waits.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CITIES } from "../src/data/places.js";
import { parse, translate } from "../src/index.js";
import type { Confidence, Romanization } from "../src/types.js";

/**
 * Cases verified against the official tool. **Raise this as cases are verified;
 * never lower it.** It exists so a verified `expected` cannot be quietly reset
 * to `null` — the file's only value is accumulated human verification, and
 * without a floor nothing protects it.
 */
const VERIFIED_FLOOR = 0;

/**
 * Entries in the official city list that have no deliverable street addresses,
 * so no golden case can exist for them.
 */
const NO_ADDRESSES = new Set(["釣魚臺"]);

interface GoldenCase {
  input: string;
  expected: string | null;
  romanization: Romanization;
  note: string;
  /**
   * What confidence this address should come back with. Defaults to `exact`.
   * Set it to pin a road that is not in the official list — those are exactly
   * the cases where a human's reading of the official tool adds the most.
   */
  confidence?: Confidence;
  /** ISO date the case was read from the official tool. Required once verified. */
  verifiedAt?: string;
  /** Where it was read from. Required once verified. */
  source?: string;
}

const ROMANIZATIONS: Romanization[] = ["hanyu", "tongyong", "wade-giles"];
const CONFIDENCES: Confidence[] = ["exact", "inferred", "unknown"];

/**
 * Wade-Giles is never `exact` by design — no official reference exists for it —
 * but only segments that go through romanization are lowered, so an address
 * with no road or district still comes back `exact`. Hence "at most", not "is".
 */
const RANK: Record<Confidence, number> = { exact: 2, inferred: 1, unknown: 0 };

function isGoldenCase(value: unknown): value is GoldenCase {
  if (!value || typeof value !== "object") return false;
  if (!("input" in value) || typeof value.input !== "string") return false;
  if (!("expected" in value) || (value.expected !== null && typeof value.expected !== "string"))
    return false;
  if (!("romanization" in value) || !ROMANIZATIONS.some((r) => r === value.romanization))
    return false;
  if ("confidence" in value && !CONFIDENCES.some((c) => c === value.confidence)) return false;
  return "note" in value && typeof value.note === "string";
}

const raw: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/golden.json", import.meta.url), "utf8"),
);
const cases: GoldenCase[] = Array.isArray(raw) ? raw.filter(isGoldenCase) : [];
const parsed = cases.map((c) => ({ input: c.input, result: parse(c.input) }));
const verified = cases.filter((c) => c.expected !== null);
const percent = cases.length === 0 ? 0 : Math.round((verified.length / cases.length) * 100);

describe("golden: official Chunghwa Post output", () => {
  // The name carries the progress, so every CI log states it without extra output.
  it(`${verified.length}/${cases.length} cases verified against the official tool (${percent}%)`, () => {
    expect(Array.isArray(raw) ? raw.length : 0, "malformed case in golden.json").toBe(cases.length);
    expect(
      verified.length,
      `golden coverage dropped below the floor of ${VERIFIED_FLOOR}. A verified case was ` +
        "reset to null, or removed. Restore it rather than lowering VERIFIED_FLOOR.",
    ).toBeGreaterThanOrEqual(VERIFIED_FLOOR);
  });

  it("every verified case records when and where it was checked", () => {
    const undated = verified.filter((c) => !c.verifiedAt || !c.source);
    expect(
      undated.map((c) => c.input),
      "a verified case needs verifiedAt and source, so it can be re-checked when the data edition changes",
    ).toEqual([]);
    for (const c of verified) {
      expect(c.verifiedAt, `${c.input}: verifiedAt must be an ISO date`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
      // "9999-99-99" has the right shape and is not a date.
      expect(
        Number.isNaN(Date.parse(c.verifiedAt ?? "")),
        `${c.input}: verifiedAt ${c.verifiedAt} is not a real date`,
      ).toBe(false);
    }
  });

  describe("coverage", () => {
    it("holds at least 100 cases", () => {
      expect(cases.length).toBeGreaterThanOrEqual(100);
    });

    it("matches the count the README quotes", () => {
      // The README's whole pitch is that the number is never in doubt, so a
      // hard-coded numeral in prose has to be checked against the real one.
      const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
      const quoted = [...readme.matchAll(/(\d+) of (\d+) verified/g)].map((m) => m.slice(1));
      expect(quoted.length, "README should state the golden progress once").toBe(1);
      expect(quoted[0]).toEqual([String(verified.length), String(cases.length)]);
    });

    it("reaches every city and county", () => {
      // Ask the parser, not the first three characters of the string. Slicing
      // breaks on every spelling the library advertises — a leading space, a
      // full-width postal code, a hyphenated 3+3 code — and would fail CI with a
      // misleading message for a perfectly valid case.
      const seen = new Set(parsed.map(({ result }) => (result.ok ? result.parts.city : undefined)));
      const missing = CITIES.map(([zh]) => zh).filter(
        (zh) => !seen.has(zh) && !NO_ADDRESSES.has(zh),
      );
      expect(missing, "golden.json should exercise every city").toEqual([]);
    });

    it("covers each city with a real street address", () => {
      // A bare "連江縣" parses and translates at `exact`, so without this a whole
      // county's coverage could be satisfied by a case that exercises no
      // district, no road and no number.
      const thin = parsed
        .filter(({ result }) => result.ok && result.parts.number === undefined)
        .map(({ input }) => input);
      expect(thin, "a golden case should be an address, not just a place name").toEqual([]);
    });

    it("exercises more than one romanization", () => {
      expect(new Set(cases.map((c) => c.romanization)).size).toBeGreaterThan(1);
    });

    it("has no duplicate input/romanization pairs", () => {
      const keys = cases.map((c) => `${c.input}\u0000${c.romanization}`);
      expect(keys.length - new Set(keys).size).toBe(0);
    });
  });

  // Runs for verified and pending cases alike: a fixture that stops parsing, or
  // whose confidence drops, is a regression whatever the official spelling is.
  it("every case still translates at the confidence it declares", () => {
    const broken: string[] = [];
    for (const c of cases) {
      const r = translate(c.input, { romanization: c.romanization });
      const want = c.confidence ?? "exact";
      const ok =
        r.english !== "" &&
        (c.romanization === "wade-giles"
          ? RANK[r.confidence] <= RANK[want]
          : r.confidence === want);
      if (!ok) {
        broken.push(
          `${c.input} [${c.romanization}] → ${r.confidence}, expected ${want} ${JSON.stringify(r.english)}`,
        );
      }
    }
    expect(broken).toEqual([]);
  });

  describe("official spelling", () => {
    for (const c of cases) {
      const name = `${c.input} [${c.romanization}] — ${c.note}`;
      if (c.expected === null) {
        it.todo(name);
        continue;
      }
      it(name, () => {
        const r = translate(c.input, { romanization: c.romanization });
        expect(r.english).toBe(c.expected);
        expect(RANK[r.confidence]).toBeLessThanOrEqual(RANK[c.confidence ?? "exact"]);
      });
    }
  });
});
