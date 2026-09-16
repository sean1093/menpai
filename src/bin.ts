#!/usr/bin/env node
/**
 * Thin shell around {@link runCli}: reads argv and stdin, writes stdout/stderr,
 * sets the exit code. All the behaviour lives in `./cli.js` so it can be tested
 * without spawning a process.
 */
import { readFileSync } from "node:fs";
import { runCli, wantsStdin } from "./cli.js";

function version(): string {
  try {
    const pkg: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    if (pkg && typeof pkg === "object" && "version" in pkg && typeof pkg.version === "string") {
      return pkg.version;
    }
  } catch {
    // Reading the manifest is a convenience, never a reason to fail.
  }
  return "unknown";
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const argv = process.argv.slice(2);
// Only touch stdin when the arguments actually call for it, so `menpai --version`
// in a pipeline does not block on input that never arrives.
const stdin = wantsStdin(argv) ? await readStdin() : "";
const result = runCli(argv, stdin, version());

// A closed pipe (`| head`) is a normal way for this to end, not an error.
process.stdout.on("error", () => process.exit(result.code));
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.code;
