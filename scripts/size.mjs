// Prints the compressed size of the built ESM bundle (the number quoted in README).
import { readFileSync } from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";

const file = new URL("../dist/index.js", import.meta.url);
const source = readFileSync(file);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(
  `dist/index.js  raw ${kb(source.length)}  gzip ${kb(gzipSync(source, { level: 9 }).length)}  brotli ${kb(brotliCompressSync(source).length)}`,
);
