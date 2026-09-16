import { defineConfig } from "tsup";

export default defineConfig({
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
});
