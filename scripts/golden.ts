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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
const PLAN = here("../docs/TEST_PLAN.md");

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

/** Only an explicit yes. `REPLACE=0` must not enable a destructive overwrite. */
const replaceRequested = (): boolean => /^(1|true|yes)$/i.test(process.env.REPLACE ?? "");

function ingest(file: string | undefined): void {
  if (!file) die("ingest needs a TSV file: npm run golden:ingest -- filled.tsv");
  const path = resolve(process.cwd(), file);
  // The usual way to get here is `worksheet` having returned early without
  // writing anything; a raw ENOENT stack trace explains none of that.
  if (!existsSync(path)) die(`no such file: ${file}`);

  // Numbered before filtering, so a complaint about "row 7" means line 7 of the
  // file the reader is looking at.
  const rows = read(path)
    .split(/\r?\n/)
    .map((text, index) => ({ text, line: index + 1 }))
    .filter((row) => row.text.trim() !== "")
    // `npm run … > sheet.tsv` captures npm's own banner on stdout. Dropping
    // those lines beats failing the whole file over them.
    .filter((row) => !/^> /.test(row.text))
    .filter((row) => !row.text.startsWith("input\t"));
  if (rows.length === 0) die("the file has no rows");

  const answers = new Map<string, string>();
  const problems: string[] = [];
  for (const { text, line } of rows) {
    const columns = text.split("\t");
    const [input = "", romanization = ""] = columns;
    const where = `line ${line} (${input || "no input"})`;
    /*
     * Three columns exactly. A row that lost one shifts the answer into the
     * romanization slot and leaves english empty — which would otherwise read
     * as "not filled in yet", silently discarding a lookup somebody did.
     */
    if (columns.length < 3) {
      problems.push(`${where}: ${columns.length} column(s), expected 3 separated by tabs`);
      continue;
    }
    const english = columns.slice(2).join("\t").trim();
    if (!input || !romanization) {
      problems.push(`${where}: input and romanization are both required`);
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
  let rechecked = 0;

  for (const [key, english] of answers) {
    const hit = all.find((c) => keyOf(c) === key);
    if (!hit) {
      unknown.push(key.replace("\t", " / "));
      continue;
    }
    if (hit.expected === english) {
      // Same answer, read again today: that is exactly what verifiedAt is for
      // when the data edition moves, so it moves too.
      hit.verifiedAt = today;
      hit.source = SOURCE;
      rechecked++;
      continue;
    }
    // An already-verified case coming back different means the data edition
    // moved or one of the two readings was wrong. A human decides which.
    if (hit.expected !== null) {
      overwrites.push(
        `${hit.input} [${hit.romanization}]\n    was: ${hit.expected}\n    now: ${english}`,
      );
      if (!replaceRequested()) continue;
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

  /*
   * Everything below is computed before anything is written. Writing the JSON
   * first and then discovering the README sentence is missing would leave three
   * files disagreeing, with the floor raised and unlowerable.
   */
  const verified = all.filter((c) => c.expected !== null).length;

  const test = read(TEST);
  const floorLine = /const VERIFIED_FLOOR = (\d+);/.exec(test);
  if (!floorLine?.[1]) die("could not find VERIFIED_FLOOR in test/golden.test.ts");
  const floor = Number(floorLine[1]);
  // The floor only ever rises; the test refuses to run below it.
  const nextTest =
    verified > floor ? test.replace(floorLine[0], `const VERIFIED_FLOOR = ${verified};`) : test;

  // A test asserts the README's count against the real one, and the sample test
  // output beside it is just as wrong if it is left behind.
  const readme = read(README);
  if (!/(\d+) of (\d+) verified/.test(readme)) {
    die("could not find the 'N of M verified' sentence in README.md");
  }
  const percent = Math.round((verified / all.length) * 100);
  const nextReadme = readme
    .replace(/\d+ of \d+ verified/, `${verified} of ${all.length} verified`)
    .replace(
      /\d+\/\d+ cases verified against the official tool \(\d+%\)/,
      `${verified}/${all.length} cases verified against the official tool (${percent}%)`,
    );

  const plan = read(PLAN);
  const nextPlan = plan.replace(
    /\d+ of \d+ cases verified against the official tool/,
    `${verified} of ${all.length} cases verified against the official tool`,
  );

  writeFileSync(GOLDEN, `${JSON.stringify(all, null, 2)}\n`);
  if (nextTest !== test) writeFileSync(TEST, nextTest);
  if (nextReadme !== readme) writeFileSync(README, nextReadme);
  if (nextPlan !== plan) writeFileSync(PLAN, nextPlan);

  console.error(
    `golden: ${filled} newly verified, ${rechecked} re-read unchanged. ` +
      `${verified}/${all.length} total; floor now ${Math.max(floor, verified)}.`,
  );
  disagreements(all);

  if (overwrites.length > 0) {
    console.error("\ngolden: these cases already had a different verified answer:");
    for (const o of overwrites) console.error(`  ${o}`);
    if (!replaceRequested()) {
      console.error("  Left as they were. Re-run with REPLACE=1 if the new reading is correct.");
      // Non-zero, so `ingest && git commit` stops at the one case needing a human.
      process.exit(2);
    }
  }
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
