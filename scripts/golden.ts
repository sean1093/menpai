/**
 * Bookkeeping for the golden fixtures, so that verifying them is only the
 * lookups and none of the clerical work.
 *
 * `test/fixtures/golden.json` is the one place in this repo holding an
 * *independent* judgement: what the Chunghwa Post translation tool says an
 * address is in English. Every other layer of the suite checks menpai against
 * itself or against official *name* spellings, so a composition rule that is
 * confidently wrong survives all of them. Only these cases catch it — and only
 * while every `expected` came from the official tool rather than from menpai.
 *
 * The tool has no API and a human has to operate it, so the job splits in two:
 *
 *   npm run golden:worksheet > todo.tsv      # what to look up
 *   npm run golden:ingest -- todo.tsv        # file the answers
 *
 * `ingest` writes `expected`, `verifiedAt` and `source`, raises
 * `VERIFIED_FLOOR`, updates the count the README quotes, and reports every case
 * where menpai disagrees with the tool. It never edits an answer to make a test
 * pass: a disagreement is a bug to look at, which is the reason the file exists.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { translate } from "../src/index.js";
import type { Confidence, Romanization } from "../src/types.js";

interface GoldenCase {
  input: string;
  expected: string | null;
  romanization: Romanization;
  note: string;
  confidence?: Confidence;
  verifiedAt?: string;
  source?: string;
}

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const GOLDEN = here("../test/fixtures/golden.json");
const TEST = here("../test/golden.test.ts");
const README = here("../README.md");

const SOURCE = "https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=207";
const CJK = /[㐀-䶿一-鿿]/;

const read = (path: string) => readFileSync(path, "utf8");
const load = (): GoldenCase[] => JSON.parse(read(GOLDEN)) as GoldenCase[];
const keyOf = (c: { input: string; romanization: string }) => `${c.input}\t${c.romanization}`;

function die(message: string): never {
  console.error(`golden: ${message}`);
  process.exit(1);
}

function worksheet(file: string | undefined): void {
  const pending = load().filter((c) => c.expected === null);
  if (pending.length === 0) {
    console.error("golden: every case is already verified.");
    return;
  }
  /*
   * Deliberately no column holding menpai's current output. The only reason to
   * open the official tool is to get a judgement that does not come from this
   * codebase; showing our answer beside the empty box invites confirming it
   * rather than reading it, and one copied row is indistinguishable from a
   * verified one afterwards.
   */
  const tsv = [
    ["input", "romanization", "official_english"].join("\t"),
    ...pending.map((c) => [c.input, c.romanization, ""].join("\t")),
  ].join("\n");

  /*
   * Writing the file here rather than leaving the caller to redirect: `npm run`
   * prints its own banner on *stdout*, so `npm run golden:worksheet > todo.tsv`
   * silently prepends two junk lines to the sheet, and ingest then rejects the
   * whole file over them.
   */
  if (file) writeFileSync(resolve(process.cwd(), file), `${tsv}\n`);
  else console.log(tsv);

  const systems = [...new Set(pending.map((c) => c.romanization))].sort();
  console.error(
    `golden: ${pending.length} case(s) to look up, in: ${systems.join(", ")}.\n` +
      (file ? `  Written to ${file}.\n` : "") +
      `  Paste each 'input' into ${SOURCE}\n` +
      "  and copy its output verbatim into official_english. Then:\n" +
      `    npm run golden:ingest -- ${file ?? "<filled.tsv>"}\n` +
      "  Partial sheets are fine — rows you leave blank stay unverified.",
  );
}

/**
 * Rejects an answer that cannot have come from the official tool, so a
 * half-filled or mis-pasted sheet fails here instead of becoming a fixture that
 * merely looks verified. It cannot catch a wrong-but-plausible answer — nothing
 * can, which is why the disagreement report is printed rather than acted on.
 */
function reject(english: string, where: string): string | undefined {
  if (english === "") return `${where}: empty`;
  if (CJK.test(english)) return `${where}: still Chinese`;
  if (!/[A-Za-z]/.test(english)) return `${where}: no Latin letters`;
  if (!english.includes(",")) return `${where}: no comma, so not a full address`;
  return undefined;
}

function ingest(file: string | undefined): void {
  if (!file) die("ingest needs a TSV file: npm run golden:ingest -- filled.tsv");
  const lines = read(resolve(process.cwd(), file))
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    // `npm run … > sheet.tsv` captures npm's own banner on stdout. Dropping
    // those two lines beats failing the whole file over them.
    .filter((line) => !/^> /.test(line));
  if (lines.length === 0) die("the file is empty");
  if (lines[0]?.startsWith("input\t")) lines.shift();

  const answers = new Map<string, string>();
  const problems: string[] = [];
  for (const [i, line] of lines.entries()) {
    const [input = "", romanization = "", ...rest] = line.split("\t");
    const english = rest.join("\t").trim();
    const where = `row ${i + 1} (${input || "no input"})`;
    if (!input || !romanization) {
      problems.push(`${where}: expected three tab-separated columns`);
      continue;
    }
    // A row left blank is "not done yet", not an error.
    if (english === "") continue;
    const bad = reject(english, where);
    if (bad) {
      problems.push(bad);
      continue;
    }
    answers.set(`${input}\t${romanization}`, english);
  }
  if (problems.length > 0) {
    console.error(`golden: ${problems.length} row(s) unusable, nothing written:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  if (answers.size === 0) die("no filled rows found");

  const all = load();
  const today = new Date().toISOString().slice(0, 10);
  const unknown: string[] = [];
  const overwrites: string[] = [];
  let filled = 0;
  let unchanged = 0;

  for (const [key, english] of answers) {
    const hit = all.find((c) => keyOf(c) === key);
    if (!hit) {
      unknown.push(key.replace("\t", " / "));
      continue;
    }
    if (hit.expected === english) {
      unchanged++;
      continue;
    }
    // An already-verified case coming back different means the data edition
    // moved or one of the two readings was wrong. A human decides which.
    if (hit.expected !== null) {
      overwrites.push(
        `${hit.input} [${hit.romanization}]\n    was: ${hit.expected}\n    now: ${english}`,
      );
      if (!process.env.REPLACE) continue;
    }
    hit.expected = english;
    hit.verifiedAt = today;
    hit.source = SOURCE;
    filled++;
  }

  if (unknown.length > 0) {
    console.error(`golden: ${unknown.length} row(s) match no case, nothing written:`);
    for (const u of unknown) console.error(`  ${u}`);
    console.error("  The input and romanization must match a case exactly.");
    process.exit(1);
  }
  if (overwrites.length > 0) {
    console.error("golden: these cases already had a different verified answer:");
    for (const o of overwrites) console.error(`  ${o}`);
    if (!process.env.REPLACE) {
      console.error("  Left untouched. Re-run with REPLACE=1 if the new reading is correct.");
    }
  }

  const verified = all.filter((c) => c.expected !== null).length;
  writeFileSync(GOLDEN, `${JSON.stringify(all, null, 2)}\n`);

  // The floor only ever rises; the test refuses to run below it.
  const test = read(TEST);
  const floorLine = /const VERIFIED_FLOOR = (\d+);/.exec(test);
  if (!floorLine?.[1]) die("could not find VERIFIED_FLOOR in test/golden.test.ts");
  const floor = Number(floorLine[1]);
  if (verified > floor) {
    writeFileSync(TEST, test.replace(floorLine[0], `const VERIFIED_FLOOR = ${verified};`));
  }

  // A test asserts this sentence against the real count, so it has to move too.
  const readme = read(README);
  const quoted = /(\d+) of (\d+) verified/.exec(readme);
  if (!quoted) die("could not find the 'N of M verified' sentence in README.md");
  writeFileSync(README, readme.replace(quoted[0], `${verified} of ${all.length} verified`));

  console.error(
    `golden: ${filled} newly verified, ${unchanged} already matching. ` +
      `${verified}/${all.length} total; floor now ${Math.max(floor, verified)}.`,
  );
  disagreements(all);
}

/**
 * Where menpai and the official tool disagree. Printed, never reconciled: the
 * README is explicit that a disagreement is a bug worth an issue rather than an
 * `expected` bent to fit, and a script that quietly reconciled the two would
 * throw away the only independent signal in the suite.
 */
function disagreements(all: GoldenCase[]): void {
  const differs: string[] = [];
  for (const c of all) {
    if (c.expected === null) continue;
    const got = translate(c.input, { romanization: c.romanization }).english;
    if (got !== c.expected) {
      differs.push(
        `${c.input} [${c.romanization}]\n    official: ${c.expected}\n    menpai:   ${got}`,
      );
    }
  }
  if (differs.length === 0) {
    console.error("golden: menpai agrees with the official tool on every verified case.");
    return;
  }
  console.error(
    `\ngolden: ${differs.length} disagreement(s) — each is a bug, not a fixture to edit:`,
  );
  for (const d of differs) console.error(`  ${d}`);
}

const [command, file] = process.argv.slice(2);
if (command === "worksheet") worksheet(file);
else if (command === "ingest") ingest(file);
else die("usage: golden.ts worksheet [out.tsv] | golden.ts ingest <filled.tsv>");
