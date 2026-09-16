/**
 * Integration tests that spawn the real entry point.
 *
 * `test/cli.test.ts` covers `runCli`, which is pure. `src/bin.ts` is the part
 * that touches `process` — reading stdin, exit codes, a closed stdout — and it
 * is where the one shipped bug so far lived: `menpai --version` blocked forever
 * on a pipe nobody closed, while every unit test was green. So these run the
 * module as a process.
 *
 * `tsx` runs the TypeScript source directly, so this needs no build step and
 * tests the same code the build emits.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../src/bin.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const TAIPEI = "台北市大安區忠孝東路四段1號";

interface Run {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

/**
 * Runs the bin. `stdin: "hold"` keeps stdin open and never writes to it — the
 * shape that made `--version` hang, and the one a shell pipeline produces.
 */
function run(args: string[], stdin: string | "hold" = "", timeoutMs = 15_000): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [BIN, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
    if (stdin !== "hold") child.stdin.end(stdin);
  });
}

describe("bin", () => {
  it("translates an address given as an argument", async () => {
    const r = await run([TAIPEI]);
    expect(r.stdout.trim()).toBe(
      "No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)",
    );
    expect(r.code).toBe(0);
  });

  it("reads a batch from stdin", async () => {
    const r = await run([], `${TAIPEI}\n\n高雄市三民區民族一路100號\n`);
    expect(r.stdout.trim().split("\n")).toHaveLength(2);
    expect(r.code).toBe(0);
  });

  describe("never blocks on a pipe it does not need", () => {
    // The regression. Each of these must finish with stdin open and silent.
    for (const args of [["--version"], ["-v"], ["--help"], ["-h"], ["--nope"], [TAIPEI]]) {
      it(args.join(" "), async () => {
        const r = await run(args, "hold");
        expect(r.timedOut, `${args.join(" ")} blocked on stdin`).toBe(false);
      });
    }
  });

  it("does block when it is genuinely waiting for stdin", async () => {
    // The other half of the contract: with no address, reading stdin is correct.
    const r = await run([], "hold", 3_000);
    expect(r.timedOut).toBe(true);
  });

  it("exits 0 when everything is exact and 1 when a row needs a human", async () => {
    expect((await run([TAIPEI])).code).toBe(0);
    expect((await run(["台北市信義區不存在的路99號"])).code).toBe(1);
    expect((await run(["忠孝東路四段1號"])).code).toBe(1);
  });

  it("exits 2 on a usage error, with nothing on stdout", async () => {
    const r = await run(["--nope"]);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("unknown option --nope");
  });

  it("keeps notes off stdout", async () => {
    const r = await run(["台北市信義區不存在的路99號"]);
    expect(r.stdout).not.toContain("不存在的路");
    expect(r.stderr).toContain("不存在的路");
  });

  it("survives a closed stdout without crashing", async () => {
    // What `| head -1` does to a long batch.
    const child = spawn(TSX, [BIN], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.destroy();
    child.stdin.end(`${TAIPEI}\n`.repeat(2000));
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    expect(stderr).not.toMatch(/EPIPE|Unhandled|TypeError/);
    expect(code).not.toBe(null);
  });

  it("prints a version", async () => {
    const r = await run(["--version"]);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$|^unknown$/);
    expect(r.code).toBe(0);
  });
});
