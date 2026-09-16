import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: false,
    clean: true,
    target: "es2020",
    platform: "neutral",
    treeshake: true,
    minify: false,
    esbuildOptions(options) {
      // Keep CJK strings as UTF-8 instead of \uXXXX escapes (halves the bundle).
      options.charset = "utf8";
    },
  },
  {
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
  },
]);
