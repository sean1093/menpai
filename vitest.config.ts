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
      /*
       * A floor, not a target. It sits a few points under the measured numbers
       * (99.63% statements, 92.26% branches) so that ordinary work does not
       * trip it, and it is here for one specific failure: `site/src/main.ts`
       * sat at 0% — 322 lines, including the worst bug of the 0.2.0 cycle —
       * and nothing said so. Losing that file again drops overall statements
       * to roughly 73%, which this catches.
       *
       * Raising these to chase 100% would invite the thing rule 3 of
       * docs/TEST_PLAN.md warns about: assertions written to touch lines
       * rather than to prove behaviour.
       */
      thresholds: {
        statements: 97,
        branches: 88,
        functions: 97,
        lines: 97,
      },
    },
  },
  resolve: {
    // `site/src/main.ts` imports the library by package name, the way a consumer
    // does, so testing the site needs the same alias `site/vite.config.ts` uses.
    alias: { menpai: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
  },
});
