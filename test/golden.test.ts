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
import { translate } from "../src/index.js";
import type { Romanization } from "../src/types.js";

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
  /** ISO date the case was read from the official tool. Required once verified. */
  verifiedAt?: string;
  /** Where it was read from. Required once verified. */
  source?: string;
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
    }
  });

  describe("coverage", () => {
    it("holds at least 100 cases", () => {
      expect(cases.length).toBeGreaterThanOrEqual(100);
    });

    it("reaches every city and county", () => {
      const seen = new Set(
        cases.map((c) => {
          const withoutZip = c.input.replace(/^\d{3,6}[\s-]*/, "").replace(/台/g, "臺");
          return withoutZip.slice(0, 3);
        }),
      );
      const missing = CITIES.map(([zh]) => zh).filter(
        (zh) => !seen.has(zh) && !NO_ADDRESSES.has(zh),
      );
      expect(missing, "golden.json should exercise every city").toEqual([]);
    });

    it("exercises more than one romanization", () => {
      expect(new Set(cases.map((c) => c.romanization)).size).toBeGreaterThan(1);
    });

    it("has no duplicate input/romanization pairs", () => {
      const keys = cases.map(
        (c) => `${c.input}
${c.romanization}`,
      );
      expect(keys.length - new Set(keys).size).toBe(0);
    });
  });

  // Runs for verified and pending cases alike: a fixture that stops parsing, or
  // whose confidence drops, is a regression whatever the official spelling is.
  it("every case still translates to a confident address", () => {
    const broken: string[] = [];
    for (const c of cases) {
      const r = translate(c.input, { romanization: c.romanization });
      // Wade-Giles is never `exact` by design — no official reference exists for it.
      const want = c.romanization === "wade-giles" ? "inferred" : "exact";
      if (r.english === "" || r.confidence !== want) {
        broken.push(
          `${c.input} [${c.romanization}] → ${r.confidence} ${JSON.stringify(r.english)}`,
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
        expect(r.confidence).toBe(c.romanization === "wade-giles" ? "inferred" : "exact");
      });
    }
  });
});
