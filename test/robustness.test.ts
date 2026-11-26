/**
 * Guards against input that is hostile, malformed, or merely unusual.
 *
 * Three different kinds of thing live here because they share one property:
 * every one of them used to produce a confident-looking wrong answer, a crash,
 * or a multi-second stall, from input a real caller can plausibly receive.
 *
 *  - complexity guards, so one request cannot monopolise a CPU
 *  - input guards, so a null column cannot end a batch job
 *  - address forms that were parsed into something fabricated or incomplete
 */
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { deriveNamed } from "../src/derive.js";
import { charReading } from "../src/dict.js";
import { format, parse, translate } from "../src/index.js";
import { normalizeSections } from "../src/text.js";

/**
 * Times `work` and returns the elapsed milliseconds.
 *
 * The ceilings asserted below are ~100× the fixed cost and ~8× below the broken
 * cost, which is wide enough that a slow or contended CI machine cannot flip
 * them. They are regression detectors for a complexity class, not benchmarks.
 */
function ms(work: () => void): number {
  const started = performance.now();
  work();
  return performance.now() - started;
}

/**
 * Control characters present in `text`, as `U+XXXX` names.
 *
 * Returning the offenders rather than a boolean so a failure says which
 * character got through. Written as a codepoint test for the same reason as
 * `safe()` in src/cli.ts: a regex class of control characters is what
 * `noControlCharactersInRegex` is for.
 */
function offenders(text: string): string[] {
  return Array.from(text)
    .map((ch) => ch.codePointAt(0) ?? 0)
    .filter(
      (code) => code <= 0x08 || (code >= 0x0b && code <= 0x1f) || (code >= 0x7f && code <= 0x9f),
    )
    .map((code) => `U+${code.toString(16).padStart(4, "0")}`);
}

describe("complexity guards", () => {
  /*
   * A CJK character in the fixture is load-bearing, not decoration.
   *
   * V8 applies a required-literal fast scan to one-byte strings, so the same
   * 262,144 digits as pure ASCII run in 0.2 ms and hide the bug completely.
   * Two-byte strings get no such scan: they took 34 seconds. Any real address
   * carries a city name, so two-byte is the case that matters. Build these
   * fixtures with a CJK prefix — never from pure ASCII.
   */
  const digits = (n: number) => `臺北市${"9".repeat(n)}`;

  it("normalizes sections in linear time", () => {
    // Unbounded, the `段` run re-scanned from every offset: 2.0 s at 65,536.
    expect(ms(() => normalizeSections(digits(65_536)))).toBeLessThan(250);
  });

  it("parses a long numeral run without stalling", () => {
    // The same quadratic blowup, reached through the public API.
    expect(ms(() => translate(digits(900)))).toBeLessThan(250);
  });

  it("derives a name ending in no numeral in linear time", () => {
    // A lazy prefix plus a greedy run anchored at `$`: 266 ms at 16,000.
    expect(ms(() => deriveNamed(`${"一".repeat(16_000)}X`, charReading))).toBeLessThan(100);
  });

  it("segments a long romanizable word without exponential backtracking", () => {
    /*
     * Syllable search retried every boundary under each earlier choice. Only
     * reachable through format(), which takes field values from the caller.
     *
     * 67 characters is chosen deliberately: it took 1.9 s unmemoised and 0.8 ms
     * now, so breaking the memo fails this in about two seconds. A longer
     * fixture looks more impressive and is worse — the growth is ~4× per 6
     * characters, so at 120 characters a regression hangs the suite instead of
     * failing it, and the loop is synchronous so vitest cannot time it out.
     */
    const road = `${"nan".repeat(22)}v`;
    expect(road).toHaveLength(67);
    expect(ms(() => format({ road }, { romanization: "wade-giles" }))).toBeLessThan(250);
  });

  it("still romanizes and sections ordinary names correctly", () => {
    // The bounds above must not have changed any real output.
    expect(normalizeSections("忠孝東路四段1號")).toBe("忠孝東路4段1號");
    expect(normalizeSections("遊園路1段七十二北巷")).toBe("遊園路1段七十二北巷");
    expect(translate("臺北市大安區忠孝東路四段1號", { romanization: "wade-giles" }).english).toBe(
      "No. 1, Sec. 4, Chunghsiao E. Rd., Ta'an Dist., Taipei City 106, Taiwan (R.O.C.)",
    );
  });
});

describe("input guards", () => {
  it("reports a non-string instead of throwing", () => {
    // A nullable address column used to throw a TypeError out of normalizeZh
    // and take the whole batch with it.
    for (const value of [undefined, null, 123, {}, []]) {
      const result = parse(value as never);
      expect(result.ok, JSON.stringify(value ?? null)).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe("invalid-input");
    }
  });

  it("refuses input longer than any real address", () => {
    const result = parse(`臺北市${"9".repeat(2000)}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("input-too-long");
  });

  it("drops non-string part values rather than throwing", () => {
    expect(format(null as never).english).toBe("");
    expect(format({ number: 7 } as never, { country: false }).english).toBe("");
    // A good part beside a bad one still renders.
    expect(format({ city: "臺北市", number: 7 } as never, { country: false }).english).toBe(
      "Taipei City",
    );
  });
});

describe("addresses that used to be read wrongly", () => {
  it("keeps the house number when the separator is a Unicode dash", () => {
    // Word and most web editors autocorrect `-` to `–`, and the whole house
    // number was being dropped — the most delivery-fatal omission there is.
    for (const dash of ["-", "–", "—", "−"]) {
      const result = translate(`臺北市大安區忠孝東路四段1${dash}1號`);
      expect(result.english, `U+${dash.codePointAt(0)?.toString(16)}`).toBe(
        "No. 1-1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)",
      );
      expect(result.confidence).toBe("exact");
    }
  });

  it("accepts the official province prefix", () => {
    // 福建省金門縣 is what appears on an ID card and a 戶籍謄本; the whole
    // address used to fail with city-not-found.
    expect(translate("福建省金門縣金城鎮民族路100號").english).toBe(
      "No. 100, Minzu Rd., Jincheng Township, Kinmen County 893, Taiwan (R.O.C.)",
    );
    expect(translate("臺灣省彰化縣鹿港鎮中山路100號").confidence).toBe("exact");
  });

  it("does not invent a road out of a district from another city", () => {
    // 板橋區 is New Taipei. This used to render the fabricated road
    // "Banqiaoquwenhua Rd." with the district and postal code silently gone,
    // no warning, and confidence "inferred".
    const result = translate("臺北市板橋區文化路一段188號");
    expect(result.english).not.toContain("Banqiaoquwenhua");
    expect(result.confidence).toBe("unknown");
    const warning = (result.warnings ?? []).find((w) => w.code === "area-city-mismatch");
    expect(warning?.text).toBe("板橋區");
    // Carries the city it does belong to, so a caller can offer the correction.
    expect(warning?.resolved).toBe("新北市");
  });

  it("names the mistake when a second city stands where a district should", () => {
    // 新竹市 is a provincial city, not a township of 新竹縣.
    const warning = (translate("新竹縣新竹市光復路一段1號").warnings ?? []).find(
      (w) => w.code === "area-city-mismatch",
    );
    expect(warning?.text).toBe("新竹市");
  });

  it("recovers the district from a postal code when none was written", () => {
    // Dropping 區 is extremely common, and Chunghwa Post requires the district.
    const result = translate("106臺北市忠孝東路四段1號");
    expect(result.english).toContain("Da'an Dist.");
    const warning = (result.warnings ?? []).find(
      (w) => w.code === "area-inferred-from-postal-code",
    );
    expect(warning?.resolved).toBe("大安區");
  });

  it("maps a district renamed out of existence to the right place", () => {
    // 高雄縣三民鄉 became 那瑪夏區 (849) in 2008. The suffix-swap heuristic read
    // it as 高雄市三民區 (807) — downtown Kaohsiung, ~100 km away — at `exact`.
    const result = translate("高雄縣三民鄉民權路1號");
    expect(result.english).toContain("Namaxia Dist.");
    expect(result.english).toContain("849");
    expect(result.english).not.toContain("Sanmin");
  });

  it("accepts a whole 門牌 in the number field", () => {
    // CRMs and 戶政 exports keep `1-1` in one column. The English was already
    // right, but confidence came back `unknown` with nothing in `unresolved`
    // and no warning, so the caller was told to review it for no stated reason.
    for (const number of ["1-1", "1之1"]) {
      const result = format(
        { city: "臺北市", area: "大安區", road: "忠孝東路", section: "4", number },
        { country: false },
      );
      expect(result.english, number).toBe(
        "No. 1-1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106",
      );
      expect(result.confidence, number).toBe("exact");
    }
  });
});

describe("cli output safety", () => {
  it("strips terminal escapes from an address it echoes", () => {
    // The CLI exists to batch third-party address lists. A crafted field could
    // rewrite the window title, clear the screen over a warning above it, or
    // write to the operator's clipboard via OSC 52.
    const hostile = "臺北市大安區忠孝東路四段1號\u001b]0;PWNED\u0007";
    const result = runCli([hostile]);
    expect(offenders(result.stderr)).toEqual([]);
    // The text is still reported, just inert.
    expect(result.stderr).toContain("PWNED");
    expect(result.stderr).toContain("�");
  });

  it("leaves an ordinary address untouched", () => {
    const result = runCli(["台北市信義區不存在的路99號"]);
    expect(result.stderr).toContain("不存在的路");
    expect(result.stderr).not.toContain("�");
    expect(offenders(result.stderr)).toEqual([]);
  });

  it("keeps the tab and newline a batch file relies on", () => {
    // Only the escapes that drive a terminal are replaced; 0x09 and 0x0a are
    // ordinary separators, and mangling them would corrupt piped output.
    const result = runCli([], "台北市信義區不存在的路99號\n台北市信義區不存在的路98號\n");
    expect(result.stdout.split("\n").filter(Boolean)).toHaveLength(2);
  });
});
