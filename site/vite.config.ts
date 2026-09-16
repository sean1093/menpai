import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Emits `sw.js` from `sw-template.js` with the real hashed asset names baked in.
 *
 * Doing it here rather than at runtime is what makes the offline promise hold on
 * a cold reload: the worker knows the whole file list on install, so it does not
 * depend on anything already sitting in the HTTP cache. Hand-rolled because this
 * project ships zero dependencies and the job is twenty lines.
 */
function serviceWorker(base: string): Plugin {
  return {
    name: "menpai-service-worker",
    // After Vite's own HTML plugin, so index.html is already in the bundle and
    // its contents reach the version hash.
    enforce: "post",
    generateBundle(_options, bundle) {
      const emitted = Object.keys(bundle).filter((name) => name !== "sw.js");
      if (!emitted.includes("index.html")) {
        this.error("index.html is not in the bundle yet; the version hash would ignore it");
      }
      // `public/` is copied by Vite rather than emitted through rollup, so the
      // bundle does not list the icons or the manifest. Without these the app
      // installs but has no icon offline.
      const publicDir = fileURLToPath(new URL("./public", import.meta.url));
      const copied = readdirSync(publicDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
      // index.html first: it is the shell every navigation falls back to.
      const names = [
        "index.html",
        ...[...emitted, ...copied].filter((name) => name !== "index.html").sort(),
      ];
      const precache = names.map((name) => base + name);

      // Hash the contents, not the names: index.html is not content-hashed, so a
      // change to it alone must still invalidate the old cache.
      const digest = createHash("sha256");
      for (const name of names) {
        digest.update(name);
        const chunk = bundle[name];
        if (chunk !== undefined) {
          digest.update(chunk.type === "asset" ? chunk.source : chunk.code);
        } else if (copied.includes(name)) {
          digest.update(readFileSync(`${publicDir}/${name}`));
        }
      }
      const version = digest.digest("hex").slice(0, 12);

      const template = readFileSync(
        fileURLToPath(new URL("./sw-template.js", import.meta.url)),
        "utf8",
      );
      const source = template
        // Global, not first-only: the placeholders also appear in the
        // template's own header comment, and a first-only replace substitutes
        // the comment and leaves the code untouched.
        .replace(/__VERSION__/g, version)
        .replace(/__PRECACHE__/g, JSON.stringify(precache));
      if (source.includes("__VERSION__") || source.includes("__PRECACHE__")) {
        this.error("service worker template still has unsubstituted placeholders");
      }
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source,
      });
    },
  };
}

// The site always builds against the library source in ../src, so it reflects
// the current commit, not the last npm release.
const BASE = "/menpai/";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: BASE,
  plugins: [serviceWorker(BASE)],
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
