import { describe, expect, it } from "vitest";
import { format } from "../src/index.js";
import type { AddressParts } from "../src/types.js";

const full: AddressParts = {
  postalCode: "106070",
  city: "臺北市",
  area: "大安區",
  road: "忠孝東路",
  section: "4",
  lane: "216",
  alley: "27",
  number: "1",
  numberSuffix: "1",
  floor: "3",
  floorSuffix: "2",
  room: "5",
};

describe("format: order and abbreviations", () => {
  it("emits every part small → large in the Chunghwa Post order", () => {
    const r = format(full);
    expect(r.english).toBe(
      "Rm. 5, 3 F.-2, No. 1-1, Aly. 27, Ln. 216, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106070, Taiwan (R.O.C.)",
    );
    expect(r.confidence).toBe("exact");
    expect(r.unresolved).toEqual([]);
    expect(r.segments.map((s) => s.key)).toEqual([
      "room",
      "floor",
      "number",
      "alley",
      "lane",
      "section",
      "road",
      "area",
      "city",
      "postalCode",
    ]);
  });

  const abbreviations: [string, AddressParts, string][] = [
    ["路 → Rd.", { road: "忠孝東路" }, "Zhongxiao E. Rd."],
    ["街 → St.", { road: "三元街" }, "Sanyuan St."],
    ["大道 → Blvd.", { road: "市民大道" }, "Civic Blvd."],
    ["段 → Sec.", { road: "忠孝東路", section: "4" }, "Sec. 4, Zhongxiao E. Rd."],
    ["巷 → Ln.", { lane: "216" }, "Ln. 216"],
    ["弄 → Aly.", { alley: "27" }, "Aly. 27"],
    ["衖 → Sub-Alley", { subAlley: "3" }, "Sub-Alley 3"],
    ["號 → No.", { number: "1" }, "No. 1"],
    ["附號 → No. 1-1", { number: "1", numberSuffix: "1" }, "No. 1-1"],
    ["樓 → F.", { floor: "12" }, "12 F."],
    ["樓之 → F.-", { floor: "3", floorSuffix: "2" }, "3 F.-2"],
    ["室 → Rm.", { room: "5" }, "Rm. 5"],
    ["區 → Dist.", { city: "臺北市", area: "大安區" }, "Da'an Dist., Taipei City 106"],
    ["鄉 → Township", { city: "嘉義縣", area: "民雄鄉" }, "Minxiong Township, Chiayi County 621"],
    ["鎮 → Township", { city: "南投縣", area: "草屯鎮" }, "Caotun Township, Nantou County 542"],
    ["縣轄市 → City", { city: "新竹縣", area: "竹北市" }, "Zhubei City, Hsinchu County 302"],
    ["村 → Vil.", { village: "豊收村" }, "Lishou Vil."],
    ["里 → Vil.", { village: "龍門里" }, "Longmen Vil."],
    ["鄰 → Neighborhood", { neighborhood: "3" }, "Neighborhood 3"],
    ["東 → E.", { road: "忠孝東路" }, "Zhongxiao E. Rd."],
    ["西 → W.", { road: "中央西路" }, "Zhongyang W. Rd."],
    ["南 → S.", { road: "重慶南路" }, "Chongqing S. Rd."],
    ["北 → N.", { road: "中山北路" }, "Zhongshan N. Rd."],
    ["一路 → 1st Rd.", { road: "民族一路" }, "Minzu 1st Rd."],
    [
      "chinese numeral inputs",
      { section: "四", lane: "二一六", number: "十二", floor: "十二" },
      "12 F., No. 12, Ln. 216, Sec. 4",
    ],
    ["full-width inputs", { number: "１２", floor: "３" }, "3 F., No. 12"],
    ["地下 → B1 F.", { floor: "B1" }, "B1 F."],
    ["地下 with suffix", { floor: "B1", floorSuffix: "2" }, "B1 F.-2"],
    ["lower-case b is normalised", { floor: "b1" }, "B1 F."],
    ["raw 地下2 is normalised", { floor: "地下2" }, "B2 F."],
    ["raw 地下二 is normalised", { floor: "地下二" }, "B2 F."],
  ];
  for (const [name, parts, expected] of abbreviations) {
    it(name, () => {
      expect(format(parts, { country: false }).english).toBe(expected);
    });
  }

  it("neighborhood and village sit between road and district", () => {
    const r = format(
      {
        city: "嘉義縣",
        area: "民雄鄉",
        village: "豊收村",
        neighborhood: "3",
        road: "好收",
        number: "5",
      },
      { country: false },
    );
    expect(r.english).toBe(
      "No. 5, Haoshou, Neighborhood 3, Lishou Vil., Minxiong Township, Chiayi County 621",
    );
  });
});

describe("format: conventional city spellings", () => {
  const cities: [string, string][] = [
    ["臺北市", "Taipei City"],
    ["新北市", "New Taipei City"],
    ["高雄市", "Kaohsiung City"],
    ["基隆市", "Keelung City"],
    ["新竹市", "Hsinchu City"],
    ["新竹縣", "Hsinchu County"],
    ["臺中市", "Taichung City"],
    ["嘉義市", "Chiayi City"],
    ["嘉義縣", "Chiayi County"],
    ["屏東縣", "Pingtung County"],
    ["金門縣", "Kinmen County"],
    ["花蓮縣", "Hualien County"],
    ["臺東縣", "Taitung County"],
    ["連江縣", "Lienchiang County"],
  ];
  for (const [zh, en] of cities) {
    it(`${zh} → ${en}`, () => {
      const r = format({ city: zh }, { country: false });
      expect(r.segments[0]?.value).toBe(en);
      expect(r.segments[0]?.confidence).toBe("exact");
    });
  }

  it("keeps conventional city spellings under every romanization", () => {
    for (const romanization of ["tongyong", "wade-giles"] as const) {
      expect(
        format({ city: "高雄市", area: "三民區" }, { romanization, country: false }).english,
      ).toContain("Kaohsiung City");
    }
  });

  it("uses the conventional district spelling", () => {
    expect(format({ city: "新竹市", area: "東區" }, { country: false }).english).toBe(
      "East Dist., Hsinchu City 300",
    );
    expect(format({ city: "新北市", area: "淡水區" }, { country: false }).english).toBe(
      "Tamsui Dist., New Taipei City 251",
    );
  });
});

describe("format: postal code", () => {
  it("fills the 3-digit code from the district", () => {
    expect(format({ city: "臺北市", area: "大安區" }, { country: false }).english).toBe(
      "Da'an Dist., Taipei City 106",
    );
  });

  it("fills the 3-digit code when every district of the city shares it", () => {
    expect(format({ city: "新竹市" }, { country: false }).english).toBe("Hsinchu City 300");
    expect(format({ city: "新北市" }, { country: false }).english).toBe("New Taipei City");
  });

  it("keeps a given 3+3 code and truncates on request", () => {
    expect(format(full, { country: false, postalCode: 3 }).english).toMatch(/Taipei City 106$/);
    expect(format(full, { country: false, postalCode: 5 }).english).toMatch(/Taipei City 10607$/);
    expect(format(full, { country: false, postalCode: 6 }).english).toMatch(/Taipei City 106070$/);
  });

  it("cannot invent digits it does not know", () => {
    expect(
      format({ city: "臺北市", area: "大安區" }, { country: false, postalCode: 6 }).english,
    ).toBe("Da'an Dist., Taipei City 106");
  });

  it("flags a postal code that contradicts the district", () => {
    const r = format({ postalCode: "110", city: "臺北市", area: "大安區" });
    expect(r.confidence).toBe("unknown");
    expect(r.segments.find((s) => s.key === "postalCode")).toEqual({
      key: "postalCode",
      value: "110",
      confidence: "unknown",
    });
  });
});

describe("format: confidence and fallbacks", () => {
  it("marks a road missing from the dictionary as inferred and lists it", () => {
    const r = format({ city: "臺北市", area: "信義區", road: "不存在的路", number: "99" });
    expect(r.confidence).toBe("inferred");
    expect(r.unresolved).toEqual(["不存在的路"]);
    expect(r.segments.find((s) => s.key === "road")).toEqual({
      key: "road",
      value: "Bucunzaide Rd.",
      confidence: "inferred",
    });
  });

  it("marks a character with no reading as unknown and keeps it visible", () => {
    const r = format({ road: "𠀀路" });
    expect(r.confidence).toBe("unknown");
    expect(r.english).toContain("𠀀");
  });

  it("marks an unknown district as inferred with a suffix rule", () => {
    const r = format({ city: "臺北市", area: "虛構區" }, { country: false });
    expect(r.segments.find((s) => s.key === "area")).toEqual({
      key: "area",
      value: "Xugou Dist.",
      confidence: "inferred",
    });
    expect(r.unresolved).toEqual(["虛構區"]);
  });

  it("overall confidence is the lowest segment", () => {
    const r = format({ city: "臺北市", area: "大安區", road: "不存在的路", village: "不存在里" });
    expect(r.confidence).toBe("inferred");
  });

  it("returns unknown for empty parts", () => {
    expect(format({})).toEqual({
      english: "",
      confidence: "unknown",
      segments: [],
      unresolved: [],
    });
  });

  it("omits the country on request", () => {
    expect(format({ city: "臺北市", area: "大安區" }, { country: false }).english).not.toContain(
      "Taiwan",
    );
    expect(format({ city: "臺北市", area: "大安區" }).english).toMatch(/, Taiwan \(R\.O\.C\.\)$/);
  });
});

describe("format: romanization", () => {
  it("tongyong converts dictionary names syllable by syllable", () => {
    expect(format(full, { romanization: "tongyong" }).english).toBe(
      "Rm. 5, 3 F.-2, No. 1-1, Aly. 27, Ln. 216, Sec. 4, Jhongsiao E. Rd., Da'an Dist., Taipei City 106070, Taiwan (R.O.C.)",
    );
    expect(
      format(
        { city: "新北市", area: "板橋區", road: "文化路" },
        { romanization: "tongyong", country: false },
      ).english,
    ).toBe("Wunhua Rd., Banciao Dist., New Taipei City 220");
    expect(
      format({ city: "嘉義縣", area: "民雄鄉" }, { romanization: "tongyong", country: false })
        .english,
    ).toBe("Minsyong Township, Chiayi County 621");
  });

  it("wade-giles converts and caps confidence at inferred", () => {
    const r = format(
      { city: "臺北市", area: "大安區", road: "忠孝東路", section: "4" },
      { romanization: "wade-giles", country: false },
    );
    expect(r.english).toBe("Sec. 4, Chunghsiao E. Rd., Ta'an Dist., Taipei City 106");
    expect(r.confidence).toBe("inferred");
    expect(r.segments.find((s) => s.key === "city")?.confidence).toBe("exact");
  });

  it("leaves conventional road spellings alone", () => {
    for (const romanization of ["tongyong", "wade-giles"] as const) {
      expect(format({ road: "羅斯福路" }, { romanization, country: false }).english).toBe(
        "Roosevelt Rd.",
      );
      expect(format({ road: "基隆路" }, { romanization, country: false }).english).toBe(
        "Keelung Rd.",
      );
    }
  });
});
