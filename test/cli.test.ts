import { describe, expect, it } from "vitest";
import { runCli, wantsStdin } from "../src/cli.js";

const TAIPEI = "台北市大安區忠孝東路四段1號3樓之2";
const TAIPEI_EN =
  "3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)";

describe("cli", () => {
  it("translates a single address", () => {
    const r = runCli([TAIPEI]);
    expect(r.stdout).toBe(`${TAIPEI_EN}\n`);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });

  it("translates stdin line by line, skipping blanks", () => {
    const r = runCli([], `${TAIPEI}\n\n  \n高雄市三民區民族一路100號\n`);
    expect(r.stdout).toBe(
      `${TAIPEI_EN}\nNo. 100, Minzu 1st Rd., Sanmin Dist., Kaohsiung City 807, Taiwan (R.O.C.)\n`,
    );
    expect(r.code).toBe(0);
  });

  it("prefers arguments over stdin", () => {
    expect(runCli([TAIPEI], "高雄市三民區民族一路100號").stdout).toBe(`${TAIPEI_EN}\n`);
  });

  describe("options", () => {
    it("takes a romanization system, space- or equals-separated", () => {
      const expected = "No. 100, Minzu 1st Rd., Sanmin Dist., Kaohsiung City 807, Taiwan (R.O.C.)";
      const input = "高雄市三民區民族一路100號";
      expect(runCli(["-r", "tongyong", input]).stdout).toBe(`${expected}\n`);
      expect(runCli(["--romanization=tongyong", input]).stdout).toBe(`${expected}\n`);
    });

    it("drops the country with --no-country", () => {
      expect(runCli(["--no-country", TAIPEI]).stdout).toBe(
        "3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106\n",
      );
    });

    it("trims the postal code", () => {
      const r = runCli(["--postal-code", "3", "106070台北市大安區忠孝東路四段1號"]);
      expect(r.stdout).toContain("Taipei City 106,");
    });

    it("emits one JSON object per line", () => {
      const r = runCli(["--json", TAIPEI]);
      const parsed: unknown = JSON.parse(r.stdout.trim());
      expect(parsed).toMatchObject({
        input: TAIPEI,
        english: TAIPEI_EN,
        confidence: "exact",
      });
    });

    it("keeps stdout clean and notes on stderr", () => {
      const r = runCli(["台北市信義區不存在的路99號"]);
      expect(r.stdout).toBe(
        "No. 99, Bucunzaide Rd., Xinyi Dist., Taipei City 110, Taiwan (R.O.C.)\n",
      );
      expect(r.stderr).toContain("不存在的路");
    });

    it("silences stderr with --quiet, without changing the exit code", () => {
      const r = runCli(["--quiet", "台北市信義區不存在的路99號"]);
      expect(r.stderr).toBe("");
      expect(r.code).toBe(1);
    });

    it("stops reading options after --", () => {
      // Lets an address that starts with a dash through.
      expect(runCli(["--", TAIPEI]).stdout).toBe(`${TAIPEI_EN}\n`);
    });
  });

  describe("exit status", () => {
    it("is 0 when every address is exact", () => {
      expect(runCli([TAIPEI, "高雄市三民區民族一路100號"]).code).toBe(0);
    });

    it("is 1 when any address is inferred", () => {
      expect(runCli(["台北市信義區不存在的路99號"]).code).toBe(1);
      // One bad address in a batch is enough: the batch needs a human.
      expect(runCli([TAIPEI, "台北市信義區不存在的路99號"]).code).toBe(1);
    });

    it("is 1 when any address is unknown", () => {
      expect(runCli(["忠孝東路四段1號"]).code).toBe(1);
    });

    it("is 2 for an unknown option", () => {
      const r = runCli(["--nope", TAIPEI]);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("unknown option --nope");
      expect(r.stdout).toBe("");
    });

    it("is 2 for a bad option value", () => {
      expect(runCli(["-r", "pinyin", TAIPEI]).code).toBe(2);
      expect(runCli(["-p", "4", TAIPEI]).code).toBe(2);
      expect(runCli(["-r"]).stderr).toContain("got nothing");
    });

    it("is 2 when there is nothing to translate", () => {
      expect(runCli([]).code).toBe(2);
      expect(runCli([], "\n  \n").code).toBe(2);
    });
  });

  describe("failure reporting", () => {
    it("explains why an address could not be parsed", () => {
      const r = runCli(["忠孝東路四段1號"]);
      expect(r.stderr).toContain("No city or county found");
      // Still emits a line, so line N of the output matches line N of the input.
      expect(r.stdout).toBe("\n");
    });

    it("names the candidate cities for an ambiguous district", () => {
      const r = runCli(["大安區中山路1號"]);
      expect(r.stderr).toContain("臺北市");
      expect(r.stderr).toContain("臺中市");
    });

    it("reports a renamed county", () => {
      const r = runCli(["桃園縣中壢市中央西路二段30號"]);
      expect(r.stderr).toContain("桃園縣");
      expect(r.code).toBe(0);
    });

    it("keeps one output line per input line even when some fail", () => {
      const r = runCli([], `${TAIPEI}\n忠孝東路四段1號\n高雄市三民區民族一路100號\n`);
      expect(r.stdout.split("\n").slice(0, 3)).toEqual([
        TAIPEI_EN,
        "",
        "No. 100, Minzu 1st Rd., Sanmin Dist., Kaohsiung City 807, Taiwan (R.O.C.)",
      ]);
    });
  });

  describe("when stdin should be read", () => {
    // `menpai --version` inside a pipeline once blocked forever waiting for input
    // that never came, because every argument started with a dash.
    it("is false for anything that does not translate", () => {
      for (const argv of [["--help"], ["-h"], ["--version"], ["-v"], ["--nope"], ["-r", "bad"]]) {
        expect(wantsStdin(argv), argv.join(" ")).toBe(false);
      }
    });

    it("is false when an address was given", () => {
      expect(wantsStdin([TAIPEI])).toBe(false);
      expect(wantsStdin(["--json", TAIPEI])).toBe(false);
      expect(wantsStdin(["--", "-weird"])).toBe(false);
    });

    it("is true only when options alone were given", () => {
      expect(wantsStdin([])).toBe(true);
      expect(wantsStdin(["--json"])).toBe(true);
      expect(wantsStdin(["-r", "tongyong", "--no-country"])).toBe(true);
    });
  });

  describe("help and version", () => {
    it("prints help to stdout and exits 0", () => {
      for (const flag of ["-h", "--help"]) {
        const r = runCli([flag]);
        expect(r.stdout).toContain("Usage");
        expect(r.code).toBe(0);
      }
    });

    it("prints the version it was given", () => {
      expect(runCli(["--version"], "", "1.2.3").stdout).toBe("1.2.3\n");
      expect(runCli(["-v"], "", "1.2.3").code).toBe(0);
    });

    it("documents every option it accepts", () => {
      const { stdout } = runCli(["--help"]);
      for (const flag of [
        "--romanization",
        "--postal-code",
        "--no-country",
        "--json",
        "--quiet",
        "--help",
        "--version",
      ]) {
        expect(stdout, `${flag} is undocumented`).toContain(flag);
      }
    });
  });
});
