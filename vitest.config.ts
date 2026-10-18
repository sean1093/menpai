import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "site/src/**/*.ts"],
      exclude: [
        // Type declarations only: nothing to execute, so it reports 0% forever.
        "src/types.ts",
        // Covered by test/bin.test.ts, which spawns it as a real process —
        // the only way to test the things that broke here (a held-open stdin,
        // a closed stdout, exit codes). A subprocess is invisible to the
        // coverage provider, so this would read as untested. Do not "fix" that
        // number by replacing those tests with in-process ones.
        "src/bin.ts",
      ],
    },
  },
  resolve: {
    // `site/src/main.ts` imports the library by package name, the way a consumer
    // does, so testing the site needs the same alias `site/vite.config.ts` uses.
    alias: { menpai: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
  },
});
