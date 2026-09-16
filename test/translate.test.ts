import { describe, expect, it } from "vitest";
import { format, translate } from "../src/index.js";

describe("translate", () => {
  it("renders the README example in the official format", () => {
    const r = translate("台北市大安區忠孝東路四段1號3樓之2");
    expect(r.english).toBe(
      "3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)",
    );
    expect(r.confidence).toBe("exact");
    expect(r.unresolved).toEqual([]);
  });

  it("passes a 3+3 postal code through", () => {
    expect(translate("106070台北市大安區忠孝東路四段1號3樓之2").english).toBe(
      "3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106070, Taiwan (R.O.C.)",
    );
  });

  it("supports every romanization option", () => {
    const input = "台北市大安區忠孝東路四段1號3樓之2";
    expect(translate(input, { romanization: "tongyong" }).english).toBe(
      "3 F.-2, No. 1, Sec. 4, Jhongsiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)",
    );
    expect(translate(input, { romanization: "wade-giles" }).english).toBe(
      "3 F.-2, No. 1, Sec. 4, Chunghsiao E. Rd., Ta'an Dist., Taipei City 106, Taiwan (R.O.C.)",
    );
    expect(translate(input, { country: false }).english).toBe(
      "3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106",
    );
  });

  it("marks an unknown road as inferred and lists it as unresolved", () => {
    const r = translate("台北市信義區不存在的路99號");
    expect(r.confidence).toBe("inferred");
    expect(r.unresolved).toEqual(["不存在的路"]);
    expect(r.english).toBe("No. 99, Bucunzaide Rd., Xinyi Dist., Taipei City 110, Taiwan (R.O.C.)");
  });

  it("never returns a confident answer for text it could not consume", () => {
    const r = translate("台北市信義區市府路1號市政大樓");
    expect(r.confidence).toBe("unknown");
    expect(r.unresolved).toEqual(["市政大樓"]);
    expect(r.english).toBe("No. 1, Shifu Rd., Xinyi Dist., Taipei City 110, Taiwan (R.O.C.)");
  });

  it("reports a parse failure as unknown with the whole input unresolved", () => {
    expect(translate("忠孝東路四段1號")).toEqual({
      english: "",
      confidence: "unknown",
      segments: [],
      unresolved: ["忠孝東路四段1號"],
      error: {
        code: "city-not-found",
        message: "No city or county found at the start of the address.",
      },
    });
  });

  it("says why it failed, for each failure code", () => {
    expect(translate("忠孝東路四段1號").error?.code).toBe("city-not-found");
    expect(translate("大安區中山路1號").error?.code).toBe("area-ambiguous");
    expect(translate("").error?.code).toBe("empty-input");
  });

  it("names the candidate cities when a district is ambiguous", () => {
    // Enough for a caller to offer a choice instead of a dead end.
    const message = translate("大安區中山路1號").error?.message ?? "";
    expect(message).toContain("臺北市");
    expect(message).toContain("臺中市");
  });

  it("carries the parse warnings through", () => {
    const r = translate("桃園縣中壢市中央西路二段30號");
    expect(r.warnings?.map((w) => w.code)).toEqual(["city-alias", "area-alias"]);
    expect(r.english).toBe(
      "No. 30, Sec. 2, Zhongyang W. Rd., Zhongli Dist., Taoyuan City 320, Taiwan (R.O.C.)",
    );
  });

  it("warns about a postal code that does not match the district", () => {
    expect(translate("110台北市大安區忠孝東路四段1號").warnings?.map((w) => w.code)).toEqual([
      "postal-code-mismatch",
    ]);
  });

  it("omits error and warnings when there is nothing to report", () => {
    const r = translate("台北市大安區忠孝東路四段1號");
    expect(Object.keys(r)).toEqual(["english", "confidence", "segments", "unresolved"]);
  });

  it("never sets error or warnings from format()", () => {
    // format() is given parts, not text, so it has nothing to report.
    expect(Object.keys(format({ city: "臺北市", area: "大安區", number: "1" }))).toEqual([
      "english",
      "confidence",
      "segments",
      "unresolved",
    ]);
  });

  it("flags a wrong postal code instead of silently correcting it", () => {
    const r = translate("110台北市大安區忠孝東路四段1號");
    expect(r.confidence).toBe("unknown");
    expect(r.english).toContain("Taipei City 110");
  });

  it("keeps the input untouched (pure function)", () => {
    const input = "台北市大安區忠孝東路四段1號3樓之2";
    const a = translate(input);
    const b = translate(input);
    expect(a).toEqual(b);
  });
});
