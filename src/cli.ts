/**
 * The CLI, minus its I/O. `runCli` is a pure function of argv and stdin text,
 * so the behaviour that matters — parsing flags, choosing an exit code, what
 * lands on stdout versus stderr — is testable without spawning a process.
 *
 * `src/bin.ts` is the thin shell that wires it to `process`.
 */
import { translate } from "./index.js";
import type { Confidence, FormatOptions, Romanization } from "./types.js";

export interface CliResult {
  stdout: string;
  stderr: string;
  /** 0 every address exact · 1 something needs a human · 2 bad usage. */
  code: 0 | 1 | 2;
}

const ROMANIZATIONS: Romanization[] = ["hanyu", "tongyong", "wade-giles"];
/** Flags that accept `--flag value` or `--flag=value`. Every other flag is a switch. */
const TAKES_VALUE = new Set(["-r", "--romanization", "-p", "--postal-code"]);

const HELP = `menpai — translate Taiwan addresses into the Chunghwa Post English format

Usage
  menpai [options] <address>...
  cat addresses.txt | menpai [options]

  With no address argument (or with a single - argument) reads stdin and
  translates one address per line. Blank lines are skipped, so the output has
  one line per non-blank input line: an address that fails still emits an empty
  line, but a blank row does not.

Options
  -r, --romanization <system>  hanyu (default) | tongyong | wade-giles
  -p, --postal-code <digits>   3 | 5 | 6 — trim to at most this many digits
                               (it never adds digits the input did not carry)
      --no-country             omit the trailing ", Taiwan (R.O.C.)"
  -j, --json                   one JSON object per line, with confidence and segments
  -q, --quiet                  do not write notes to stderr
  -h, --help                   show this help
  -v, --version                show the version

Output
  Addresses go to stdout, one per line; notes and warnings go to stderr, so
  a pipe stays clean.

Exit status
  0  every address came back "exact"
  1  at least one was "inferred" or "unknown" and needs a human to check it
  2  the command line could not be understood

Examples
  menpai "台北市大安區忠孝東路四段1號3樓之2"
  menpai --romanization tongyong --no-country "高雄市三民區民族一路100號"
  cat addresses.txt | menpai --json > out.jsonl || echo "some need review"
`;

interface Parsed {
  options: FormatOptions;
  addresses: string[];
  json: boolean;
  quiet: boolean;
  /** Set when the arguments ask to print something instead of translating. */
  print?: string;
  error?: string;
}

/** Hand-rolled: a flag parser is ~40 lines and this package ships zero dependencies. */
function parseArgs(argv: string[], version: string): Parsed {
  const parsed: Parsed = { options: {}, addresses: [], json: false, quiet: false };
  let onlyPositional = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (onlyPositional || !arg.startsWith("-") || arg === "-") {
      // `-` conventionally means stdin, and an empty argument is not an address;
      // treating either as one would suppress stdin and translate nothing.
      if (!onlyPositional && (arg === "-" || arg === "")) continue;
      parsed.addresses.push(arg);
      continue;
    }
    // `--romanization=tongyong` and `--romanization tongyong` are both accepted.
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const next = (): string | undefined => inline ?? argv[++i];
    // `--json=false` used to enable JSON. Silently doing the opposite of what
    // someone wrote is worse than telling them the flag takes no value.
    if (inline !== undefined && !TAKES_VALUE.has(flag)) {
      return { ...parsed, error: `${flag} takes no value` };
    }

    switch (flag) {
      case "--":
        onlyPositional = true;
        break;
      case "-h":
      case "--help":
        return { ...parsed, print: HELP };
      case "-v":
      case "--version":
        return { ...parsed, print: `${version}\n` };
      case "-j":
      case "--json":
        parsed.json = true;
        break;
      case "-q":
      case "--quiet":
        parsed.quiet = true;
        break;
      case "--country":
        parsed.options.country = true;
        break;
      case "--no-country":
        parsed.options.country = false;
        break;
      case "-r":
      case "--romanization": {
        const value = next();
        const found = ROMANIZATIONS.find((r) => r === value);
        if (!found) {
          return {
            ...parsed,
            error: `--romanization expects ${ROMANIZATIONS.join(", ")}; got ${value || "nothing"}`,
          };
        }
        parsed.options.romanization = found;
        break;
      }
      case "-p":
      case "--postal-code": {
        const value = next();
        if (value !== "3" && value !== "5" && value !== "6") {
          return {
            ...parsed,
            error: `--postal-code expects 3, 5 or 6; got ${value || "nothing"}`,
          };
        }
        parsed.options.postalCode = Number(value) as 3 | 5 | 6;
        break;
      }
      default:
        return { ...parsed, error: `unknown option ${flag}` };
    }
  }
  return parsed;
}

/** The whole remainder, greedily — it may itself contain a quote. */
const UNPARSED = /^Could not interpret "([\s\S]+)"\.$/;

/** Human-readable notes for stderr. Empty when the result is fully `exact`. */
function notes(input: string, result: ReturnType<typeof translate>): string[] {
  const out: string[] = [];
  if (result.error) {
    out.push(`${input}: ${result.error.message}`);
    return out;
  }
  const warnings = result.warnings ?? [];
  for (const warning of warnings) out.push(`${input}: ${warning.message}`);

  // `translate` puts the uninterpreted remainder in `unresolved` as well as
  // warning about it, and the two say opposite things: "could not interpret
  // this" versus "romanized by rule". Consume one remainder per fragment, so a
  // road that happens to read the same as the remainder keeps its own note.
  const remainders = warnings.flatMap((w) =>
    w.code === "unparsed-remainder" ? (UNPARSED.exec(w.message)?.[1] ?? []) : [],
  );
  const guessed = result.unresolved.filter((fragment) => {
    const at = remainders.indexOf(fragment);
    if (at === -1) return true;
    remainders.splice(at, 1);
    return false;
  });
  if (guessed.length > 0) {
    out.push(`${input}: not in the official list, romanized by rule: ${guessed.join(", ")}`);
  }
  return out;
}

const WORST: Record<Confidence, number> = { exact: 2, inferred: 1, unknown: 0 };

/**
 * Whether the shell should read stdin before calling {@link runCli}.
 *
 * It must not for `--help`, `--version`, a bad flag, or when an address was
 * given: those never consume stdin, and blocking on a pipe that nobody closes
 * would hang the command.
 */
export function wantsStdin(argv: string[]): boolean {
  const parsed = parseArgs(argv, "");
  return parsed.print === undefined && parsed.error === undefined && parsed.addresses.length === 0;
}

export function runCli(argv: string[], stdin = "", version = "0.0.0"): CliResult {
  const parsed = parseArgs(argv, version);
  if (parsed.error !== undefined) {
    return { stdout: "", stderr: `menpai: ${parsed.error}\n\n${HELP}`, code: 2 };
  }
  if (parsed.print !== undefined) return { stdout: parsed.print, stderr: "", code: 0 };

  const inputs =
    parsed.addresses.length > 0 ? parsed.addresses : stdin.split("\n").map((line) => line.trim());
  const addresses = inputs.filter((line) => line.length > 0);

  if (addresses.length === 0) {
    return { stdout: "", stderr: `menpai: no address given\n\n${HELP}`, code: 2 };
  }

  const stdout: string[] = [];
  const stderr: string[] = [];
  let lowest: Confidence = "exact";

  for (const address of addresses) {
    const result = translate(address, parsed.options);
    if (WORST[result.confidence] < WORST[lowest]) lowest = result.confidence;
    stdout.push(parsed.json ? JSON.stringify({ input: address, ...result }) : result.english);
    if (!parsed.quiet) stderr.push(...notes(address, result));
  }

  return {
    stdout: `${stdout.join("\n")}\n`,
    stderr: stderr.length === 0 ? "" : `${stderr.join("\n")}\n`,
    code: lowest === "exact" ? 0 : 1,
  };
}

export { HELP };
