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

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function luminance(hex: string): number {
  // A custom property accepts any token sequence, so a typo like `#86c49`
  // survives until var() substitution and then silently unsets the property —
  // the element loses its colour in the browser. Catch it here instead of
  // scoring five digits as a colour and reporting a comfortable pass.
  expect(hex, `${hex} is not a 3- or 6-digit hex colour`).toMatch(HEX);
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

/**
 * Non-text boundaries and state indicators: WCAG 1.4.11 wants 3:1. These are
 * separate from PAIRS because the threshold differs, and because they were the
 * ones nobody was checking — the country toggle's state sat at 1.75:1, and the
 * fill plus the knob position are its only indicators.
 */
const BOUNDARIES: [string, string][] = [
  ["line-strong", "card"],
  ["line-strong", "paper"],
  ["line-strong", "well"],
  // The switch knob against the unchecked track.
  ["on-ink", "line-strong"],
  ["ring", "card"],
  ["ring", "paper"],
  ["ring", "well"],
];

describe("site theme", () => {
  for (const [name, set] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    describe(name, () => {
      it("defines every colour token", () => {
        for (const [fg, bg] of [...PAIRS, ...BOUNDARIES]) {
          expect(set[fg], `--${fg} missing in ${name}`).toBeDefined();
          expect(set[bg], `--${bg} missing in ${name}`).toBeDefined();
        }
      });

      for (const [fg, bg] of BOUNDARIES) {
        it(`--${fg} on --${bg} meets the 3:1 boundary threshold`, () => {
          const ratio = contrast(set[fg] ?? "", set[bg] ?? "");
          expect(ratio, `${set[fg]} on ${set[bg]} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
            3,
          );
        });
      }

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

  it("gives the dark input well its own surface", () => {
    // Near-black surfaces all score ~1.1:1 by the WCAG formula, so a ratio says
    // nothing useful here. What matters is that the well is a distinct, darker
    // surface than the card rather than sitting on top of it.
    expect(luminance(dark.well ?? ""), "--well must be darker than --card").toBeLessThan(
      luminance(dark.card ?? ""),
    );
    expect(dark.well).not.toBe(dark.card);
    expect(dark.well).not.toBe(dark.paper);
  });

  it("separates the three confidence levels by more than colour", () => {
    // A red/green-blind reader, or a greyscale screenshot, must still tell them apart.
    expect(css).toMatch(/\.english \.seg-inferred \{[^}]*underline solid/);
    expect(css).toMatch(/\.english \.seg-unknown \{[^}]*underline wavy/);
    expect(css).toMatch(/\.dot\.inferred \{[^}]*background: transparent/);
    expect(css).toMatch(/\.dot\.unknown \{[^}]*rotate\(45deg\)/);
    // The issue list carries the same three severities and needs the same.
    expect(css).toMatch(/\.issues li\.bad::before \{[^}]*rotate\(45deg\)/);
    expect(css).toMatch(/\.issues li\.info::before \{[^}]*background: transparent/);
  });

  describe("focus rings", () => {
    // Composited at 0.12 alpha the textarea ring was invisible, and the state
    // was really being carried by its border-color.
    it("are solid, never a wash", () => {
      expect(css).not.toMatch(/rgba\(var\(--ring/);
    });

    // Naming each selector, because asserting the declaration merely *appears*
    // lets any one control lose its ring while the others keep the test green.
    const FOCUSABLE: [string, RegExp][] = [
      // The spacer matters: without it the ring's inner edge sits on the
      // control's own fill (--ink when checked, --line-strong on the switch
      // track) at 1.60–2.55:1, and no single hue clears 3:1 against those and
      // the card at once.
      ["textarea:focus", /0 0 0 2px var\(--card\),\s*0 0 0 5px var\(--ring\)/],
      [
        "\\.segmented input:focus-visible \\+ span",
        /0 0 0 2px var\(--card\),\s*0 0 0 5px var\(--ring\)/,
      ],
      [
        "\\.switch input:focus-visible \\+ \\.switch-track",
        /0 0 0 2px var\(--card\),\s*0 0 0 5px var\(--ring\)/,
      ],
      ["\\.chip:focus-visible", /outline: 3px solid var\(--ring\)/],
      ["\\.clear:focus-visible", /outline: 3px solid var\(--ring\)/],
      ["\\.primary:focus-visible", /outline: 3px solid var\(--ring\)/],
      ["\\.choices button:focus-visible", /outline: 3px solid var\(--ring\)/],
    ];
    for (const [selector, declaration] of FOCUSABLE) {
      it(`${selector.replace(/\\\\/g, "")} has one`, () => {
        const blocks = [...css.matchAll(new RegExp(`${selector}[^{]*\\{([^}]*)\\}`, "g"))].map(
          (m) => m[1] ?? "",
        );
        expect(blocks.length, `${selector} has no rule at all`).toBeGreaterThan(0);
        expect(
          blocks.some((b) => declaration.test(b)),
          `${selector} lost its focus ring`,
        ).toBe(true);
      });
    }
  });

  it("declares color-scheme, so UA-painted chrome follows the page", () => {
    // Scrollbars, form-control internals and the selection highlight are painted
    // by the browser, not by these rules. `.english` has user-select: all — the
    // main copy affordance on mobile — so a light selection over a dark card is
    // the visible failure.
    expect(css).toMatch(/color-scheme:\s*light dark/);
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
