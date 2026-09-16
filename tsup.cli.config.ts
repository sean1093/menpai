import { defineConfig } from "tsup";

// Separate from tsup.config.ts, and run after it, because tsup executes an
// array of configs with Promise.all — the library config's `clean: true` and
// this one's output would race, and a slow clean could delete the bin that was
// just written while the build still reported success.
export default defineConfig({
  // The CLI is transpiled, not bundled: it imports the library from
  // ./index.js at runtime, so the dictionaries are not shipped twice.
  entry: ["src/bin.ts", "src/cli.ts"],
  format: ["esm"],
  bundle: false,
  dts: false,
  clean: false,
  sourcemap: false,
  target: "node18",
  platform: "node",
  esbuildOptions(options) {
    options.charset = "utf8";
  },
});
