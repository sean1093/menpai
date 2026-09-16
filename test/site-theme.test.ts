/**
 * The site ships a light and a dark palette. Contrast is easy to break by
 * nudging one token, and nobody notices until someone reads the page at night,
 * so the ratios are asserted rather than eyeballed once.
 *
 * Ratios follow WCAG 2.1 relative luminance; AA wants 4.5:1 for body text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../site/src/style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");

/** Reads `--name: value;` pairs out of the first block matching `selector`. */
function tokens(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  expect(at, `${selector} not found in style.css`).toBeGreaterThanOrEqual(0);
  const block = css.slice(at + selector.length, css.indexOf("}", at));
  const found: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name && value) found[name] = value.trim();
  }
  return found;
}

const light = tokens(":root {");
const dark = tokens("@media (prefers-color-scheme: dark) {\n  :root {");

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const channels = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Foreground/background token pairs that carry text or a status mark. */
const PAIRS: [string, string][] = [
  ["ink", "paper"],
  ["ink", "card"],
  ["ink-soft", "card"],
  ["ink-soft", "paper"],
  ["ink-faint", "paper"],
  ["ok", "ok-bg"],
  ["warn", "warn-bg"],
  ["bad", "bad-bg"],
  ["bad", "card"],
  ["on-ink", "ink"],
  ["ok", "card"],
  ["warn", "card"],
];

describe("site theme", () => {
  for (const [name, set] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    describe(name, () => {
      it("defines every colour token", () => {
        for (const [fg, bg] of PAIRS) {
          expect(set[fg], `--${fg} missing in ${name}`).toBeDefined();
          expect(set[bg], `--${bg} missing in ${name}`).toBeDefined();
        }
      });

      for (const [fg, bg] of PAIRS) {
        it(`--${fg} on --${bg} meets AA`, () => {
          const ratio = contrast(set[fg] ?? "", set[bg] ?? "");
          expect(ratio, `${set[fg]} on ${set[bg]} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
            4.5,
          );
        });
      }
    });
  }

  it("dark mode overrides every colour token the light palette defines", () => {
    // A token left behind would render a light value on a dark background.
    const colours = Object.keys(light).filter((k) => /^#|^\d+,/.test(light[k] ?? ""));
    expect(colours.length).toBeGreaterThan(10);
    expect(colours.filter((k) => dark[k] === undefined)).toEqual([]);
  });

  it("separates the three confidence levels by more than colour", () => {
    // A red/green-blind reader, or a greyscale screenshot, must still tell them apart.
    expect(css).toMatch(/\.english \.seg-inferred \{[^}]*underline solid/);
    expect(css).toMatch(/\.english \.seg-unknown \{[^}]*underline wavy/);
    expect(css).toMatch(/\.dot\.inferred \{[^}]*background: transparent/);
    expect(css).toMatch(/\.dot\.unknown \{[^}]*rotate\(45deg\)/);
  });

  it("ships a theme-color for each scheme, matching the palette", () => {
    const metas = [...html.matchAll(/<meta name="theme-color"[^>]*>/g)].map((m) => m[0]);
    expect(metas).toHaveLength(2);
    const lightMeta = metas.find((m) => m.includes("prefers-color-scheme: light"));
    const darkMeta = metas.find((m) => m.includes("prefers-color-scheme: dark"));
    expect(lightMeta).toContain(`content="${light.paper}"`);
    expect(darkMeta).toContain(`content="${dark.paper}"`);
  });
});
