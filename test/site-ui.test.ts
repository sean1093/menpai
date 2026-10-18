/**
 * The web UI, driven in a DOM.
 *
 * `site/src/main.ts` was at 0% coverage — 322 lines, and the only thing most
 * people ever touch. It is also where the worst bug of the 0.2.0 cycle shipped:
 * the ambiguous-district buttons prepended a city name in front of a leading
 * postal code, turning a recoverable address into an unparseable one, and it
 * was found by hand rather than by a test.
 *
 * The module wires itself to the document on import and keeps no exports, so
 * each scenario reseeds the real `site/index.html` body and re-imports it. That
 * is deliberate: the ids, the `data-example` attributes and the radio names are
 * part of the contract between the markup and the script, and a test that built
 * its own fixture DOM would not notice either side drifting.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `import.meta.url` is a file URL here, but the *global* URL under jsdom
// resolves a relative path against the document origin rather than the base it
// is given — `new URL("../site/index.html", import.meta.url)` comes out as
// http://localhost:3000/site/index.html. So the path is derived through
// node:url instead, which keeps this independent of the working directory.
const html = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../site/index.html"),
  "utf8",
);
const BODY = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1];

/** Reseed the document and run the module against it. */
async function boot(search = ""): Promise<void> {
  document.body.innerHTML = BODY ?? "";
  window.history.replaceState({}, "", `/${search}`);
  vi.resetModules();
  await import("../site/src/main.ts");
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const address = () => $<HTMLTextAreaElement>("address");
const result = () => $<HTMLElement>("result");
const error = () => $<HTMLElement>("error");
const english = () => $<HTMLParagraphElement>("english");
const issues = () => $<HTMLUListElement>("issues");

/** Types into the textarea and converts, skipping the input debounce. */
function submit(text: string): void {
  address().value = text;
  $<HTMLButtonElement>("go").click();
}

const issueTexts = (): string[] =>
  [...issues().querySelectorAll("li")].map((li) => li.textContent ?? "");

const segmentRows = (): { label: string; value: string; confidence: string }[] =>
  [...$("segments").querySelectorAll("tr")].map((tr) => {
    const cells = tr.querySelectorAll("td");
    const mark = tr.querySelector(".dot");
    return {
      label: cells[0]?.textContent ?? "",
      value: cells[1]?.textContent ?? "",
      confidence: (mark?.className ?? "").replace("dot", "").trim(),
    };
  });

beforeEach(() => {
  // jsdom implements neither of these, and the module calls both on paths the
  // tests below exercise.
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("site UI", () => {
  it("has a body to test, so a markup change cannot silently empty this file", () => {
    expect(BODY?.length ?? 0).toBeGreaterThan(500);
  });

  describe("translating", () => {
    it("shows the English address and hides the error panel", async () => {
      await boot();
      submit("台北市大安區忠孝東路四段1號3樓之2");
      expect(result().hidden).toBe(false);
      expect(error().hidden).toBe(true);
      expect(english().textContent).toBe(
        "3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)",
      );
    });

    it("breaks the address down by part, with a labelled confidence mark", async () => {
      await boot();
      submit("高雄市三民區民族一路100號");
      const rows = segmentRows();
      expect(rows.map((r) => r.label)).toContain("路街");
      const road = rows.find((r) => r.label === "路街");
      expect(road?.value).toBe("Minzu 1st Rd.");
      expect(road?.confidence).toBe("exact");
      // A bare <span> gets no accessible name from aria-label, so the mark
      // needs role="img" for the confidence to reach a screen reader at all.
      const mark = $("segments").querySelector(".dot");
      expect(mark?.getAttribute("role")).toBe("img");
      expect(mark?.getAttribute("aria-label")).toBeTruthy();
    });

    it("underlines only the parts it is not sure about", async () => {
      await boot();
      submit("台北市信義區不存在的路99號");
      const marked = [...english().querySelectorAll("span")];
      expect(marked.length).toBeGreaterThan(0);
      for (const span of marked) expect(span.className).toMatch(/^seg-(inferred|unknown)$/);
      // The road was guessed; the city was not.
      expect(english().textContent).toContain("Taipei City");
      expect(marked.some((s) => s.textContent?.includes("Bucunzaide"))).toBe(true);
    });

    it("follows the romanization radio", async () => {
      await boot();
      submit("高雄市三民區民族一路100號");
      const before = english().textContent;
      const wade = document.querySelector<HTMLInputElement>('input[value="wade-giles"]');
      if (!wade) throw new Error("missing wade-giles radio");
      wade.checked = true;
      wade.dispatchEvent(new Event("change", { bubbles: true }));
      expect(english().textContent).not.toBe(before);
    });

    it("drops the country line when the checkbox is cleared", async () => {
      await boot();
      submit("高雄市三民區民族一路100號");
      expect(english().textContent).toContain("Taiwan (R.O.C.)");
      const country = $<HTMLInputElement>("country");
      country.checked = false;
      country.dispatchEvent(new Event("change", { bubbles: true }));
      expect(english().textContent).not.toContain("Taiwan (R.O.C.)");
    });

    it("debounces typing rather than translating every keystroke", async () => {
      vi.useFakeTimers();
      try {
        await boot();
        address().value = "台北市大安區忠孝東路四段1號";
        address().dispatchEvent(new Event("input", { bubbles: true }));
        expect(result().hidden).toBe(true);
        vi.advanceTimersByTime(250);
        expect(result().hidden).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("an address it cannot place", () => {
    it("asks for a city when there is none", async () => {
      await boot();
      submit("忠孝東路四段1號");
      expect(error().hidden).toBe(false);
      expect(result().hidden).toBe(true);
      expect($("error-text").textContent).toContain("找不到縣市");
      expect($("error-choices").hidden).toBe(true);
    });

    it("offers the candidate cities for an ambiguous district", async () => {
      await boot();
      submit("大安區中山路1號");
      expect(error().hidden).toBe(false);
      const buttons = [...$("error-choices").querySelectorAll("button")];
      expect(buttons.map((b) => b.textContent)).toContain("臺北市");
      expect($("error-choices").hidden).toBe(false);
    });

    it("inserts the chosen city after a leading postal code, not in front of it", async () => {
      // The 0.2.0 regression. `parse()` reads a postal code only at the very
      // start, so prepending the city ahead of one made the whole address
      // unreadable — the button destroyed the input it was offered to repair.
      //
      // 100 is 中正區, so it matches neither candidate and the district stays
      // ambiguous; a code that does resolve it (106) never reaches this path.
      await boot();
      submit("100大安區中山路1號");
      const taipei = [...$("error-choices").querySelectorAll("button")].find(
        (b) => b.textContent === "臺北市",
      );
      if (!taipei) throw new Error("臺北市 was not offered");
      taipei.click();
      expect(address().value).toBe("100臺北市大安區中山路1號");
      // Asserting on the city alone would not have caught the bug: the broken
      // order still produced "Taipei City, Taiwan (R.O.C.)" — correct as far as
      // it went, with the entire street address silently missing. The road and
      // the number are what prove the repair worked.
      expect(error().hidden).toBe(true);
      expect(english().textContent).toContain("No. 1, Zhongshan Rd., Da'an Dist., Taipei City");
    });

    it("still repairs an address with no postal code", async () => {
      await boot();
      submit("大安區中山路1號");
      const taipei = [...$("error-choices").querySelectorAll("button")].find(
        (b) => b.textContent === "臺北市",
      );
      taipei?.click();
      expect(address().value).toBe("臺北市大安區中山路1號");
      expect(result().hidden).toBe(false);
    });
  });

  describe("the issue list", () => {
    it("says a renamed county was translated under its current name", async () => {
      await boot();
      submit("桃園縣中壢市中央西路二段30號");
      expect(issueTexts().join("\n")).toContain("桃園縣");
      expect(issues().querySelector("li")?.className).toBe("info");
    });

    it("says which city it guessed when none was typed", async () => {
      await boot();
      submit("三民區民族一路100號");
      expect(result().hidden).toBe(false);
      expect(issueTexts().join("\n")).toContain("三民區");
      expect(issueTexts().join("\n")).toContain("高雄市");
      expect(issues().querySelector("li")?.className).toBe("info");
    });

    it("explains an unknown segment that nothing else accounts for", async () => {
      // An impossible floor makes its own segment unknown without putting
      // anything in `unresolved` or raising a warning, so the row was underlined
      // with nothing anywhere saying why.
      await boot();
      submit("臺北市大安區忠孝東路一段1號1200樓");
      expect(issueTexts().join("\n")).toContain("1200 F.");
      expect([...issues().querySelectorAll("li.bad")].length).toBeGreaterThan(0);
    });

    it("does not both disown a fragment and claim it was romanized", async () => {
      // The remainder appears in `unresolved` as well as in a warning, so the
      // page used to say "could not interpret this" directly above "we guessed
      // the pinyin" about the same text.
      await boot();
      submit("台北市信義區市府路1號市政大樓");
      const texts = issueTexts();
      expect(texts.filter((t) => t.includes("市政大樓"))).toHaveLength(1);
      expect(texts.join("\n")).toContain("無法辨識");
      expect(texts.join("\n")).not.toContain("依字音推估");
    });

    it("still reports a genuinely guessed name", async () => {
      await boot();
      submit("台北市信義區不存在的路99號");
      expect(issueTexts().join("\n")).toContain("依字音推估");
    });

    it("says nothing about an address it is sure of", async () => {
      await boot();
      submit("臺北市大安區忠孝東路一段1號12樓");
      expect(issueTexts()).toEqual([]);
    });
  });

  describe("the controls", () => {
    it("fills the textarea from an example chip", async () => {
      await boot();
      const chip = document.querySelector<HTMLButtonElement>(".chip");
      if (!chip) throw new Error("no example chip in index.html");
      chip.click();
      expect(address().value).toBe(chip.dataset.example);
      expect(result().hidden).toBe(false);
    });

    it("shows the clear button only when there is text, and resets on click", async () => {
      await boot();
      const clear = $<HTMLButtonElement>("clear");
      expect(clear.hidden).toBe(true);
      submit("臺北市大安區忠孝東路一段1號");
      expect(clear.hidden).toBe(false);
      clear.click();
      expect(address().value).toBe("");
      expect(clear.hidden).toBe(true);
      expect(result().hidden).toBe(true);
      expect(error().hidden).toBe(true);
    });

    it("converts on Enter but leaves Shift+Enter to insert a newline", async () => {
      await boot();
      address().value = "臺北市大安區忠孝東路一段1號";
      const enter = new window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      address().dispatchEvent(enter);
      expect(enter.defaultPrevented).toBe(true);
      expect(result().hidden).toBe(false);

      const shiftEnter = new window.KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      address().dispatchEvent(shiftEnter);
      expect(shiftEnter.defaultPrevented).toBe(false);
    });

    it("copies the English text and confirms it", async () => {
      await boot();
      submit("臺北市大安區忠孝東路一段1號");
      const copy = $<HTMLButtonElement>("copy");
      copy.click();
      await vi.waitFor(() => expect(copy.classList.contains("done")).toBe(true));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(english().textContent);
      expect(copy.textContent).toContain("已複製");
    });

    it("puts the copy button back after a few seconds", async () => {
      // Otherwise the button reads "已複製 ✓" forever and a second copy gives
      // no feedback at all.
      await boot();
      submit("臺北市大安區忠孝東路一段1號");
      const copy = $<HTMLButtonElement>("copy");
      // The reset timer is created by the click, so the clock has to be faked
      // before it — swapping afterwards leaves the real timer running and
      // nothing to advance.
      vi.useFakeTimers();
      try {
        copy.click();
        // The handler awaits the clipboard write; this flushes that microtask
        // without moving the clock.
        await vi.advanceTimersByTimeAsync(0);
        expect(copy.classList.contains("done")).toBe(true);
        await vi.advanceTimersByTimeAsync(2500);
      } finally {
        vi.useRealTimers();
      }
      expect(copy.textContent).toBe("複製英文地址");
      expect(copy.classList.contains("done")).toBe(false);
    });

    it("tells the reader to select the text when the clipboard is refused", async () => {
      // Safari without a user gesture, and any browser over plain http.
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      });
      document.execCommand = vi.fn().mockReturnValue(false);
      await boot();
      submit("臺北市大安區忠孝東路一段1號");
      const copy = $<HTMLButtonElement>("copy");
      copy.click();
      await vi.waitFor(() => expect(copy.textContent).toContain("無法複製"));
      expect(copy.classList.contains("done")).toBe(false);
    });
  });

  describe("deep links", () => {
    it("translates ?q= on load", async () => {
      await boot(`?q=${encodeURIComponent("臺北市大安區忠孝東路一段1號")}`);
      expect(address().value).toBe("臺北市大安區忠孝東路一段1號");
      expect(result().hidden).toBe(false);
      expect(english().textContent).toContain("Zhongxiao E. Rd.");
    });

    it("honours ?r= and reflects it in the radio", async () => {
      await boot(`?q=${encodeURIComponent("高雄市三民區民族一路100號")}&r=tongyong`);
      expect(document.querySelector<HTMLInputElement>('input[value="tongyong"]')?.checked).toBe(
        true,
      );
      expect(english().textContent).toContain("Minzu");
    });

    it("ignores a romanization it does not recognise", async () => {
      await boot(`?q=${encodeURIComponent("高雄市三民區民族一路100號")}&r=pinyin`);
      expect(document.querySelector<HTMLInputElement>('input[value="hanyu"]')?.checked).toBe(true);
      expect(result().hidden).toBe(false);
    });

    it("stays quiet with no query at all", async () => {
      await boot();
      expect(address().value).toBe("");
      expect(result().hidden).toBe(true);
      expect(error().hidden).toBe(true);
    });
  });
});
