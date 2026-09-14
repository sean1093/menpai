import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The site always builds against the library source in ../src, so it reflects
// the current commit, not the last npm release.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/menpai/",
  resolve: {
    alias: { menpai: fileURLToPath(new URL("../src/index.ts", import.meta.url)) },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
