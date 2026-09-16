// Post-build assertion. The bin is built by a second tsup run; if that ever
// silently produces nothing — or a future change reintroduces the clean/write
// race between the two configs — `npm publish` would ship a package whose
// `bin` points at a file that does not exist. Fail the build instead.
import { readFileSync, statSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const required = [
  ...Object.values(pkg.bin ?? {}),
  pkg.main,
  pkg.module,
  pkg.types,
  "./dist/cli.js",
].filter(Boolean);

const problems = [];
for (const file of required) {
  const path = new URL(`../${file.replace(/^\.\//, "")}`, import.meta.url);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    problems.push(`${file} is missing`);
    continue;
  }
  if (stat.size === 0) problems.push(`${file} is empty`);
}

for (const bin of Object.values(pkg.bin ?? {})) {
  const path = new URL(`../${bin.replace(/^\.\//, "")}`, import.meta.url);
  try {
    const first = readFileSync(path, "utf8").split("\n", 1)[0];
    if (!first.startsWith("#!")) problems.push(`${bin} has no shebang`);
  } catch {
    // Already reported as missing above.
  }
}

if (problems.length > 0) {
  console.error(`dist is not publishable:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
