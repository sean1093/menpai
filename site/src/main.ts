import {
  type AddressParts,
  type Confidence,
  type FormatResult,
  type ParseWarning,
  type Romanization,
  translate,
} from "menpai";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const addressEl = $<HTMLTextAreaElement>("address");
const clearEl = $<HTMLButtonElement>("clear");
const goEl = $<HTMLButtonElement>("go");
const countryEl = $<HTMLInputElement>("country");
const resultEl = $<HTMLElement>("result");
const statusEl = $<HTMLParagraphElement>("status");
const englishEl = $<HTMLParagraphElement>("english");
const copyEl = $<HTMLButtonElement>("copy");
const issuesEl = $<HTMLUListElement>("issues");
const segmentsEl = $<HTMLTableSectionElement>("segments");
const errorEl = $<HTMLElement>("error");
const errorTextEl = $<HTMLParagraphElement>("error-text");
const errorChoicesEl = $<HTMLDivElement>("error-choices");

const STATUS: Record<Confidence, string> = {
  exact: "已對照中華郵政官方資料",
  inferred: "有部分名稱不在官方清單，以拼音推估，請確認畫底線的部分",
  unknown: "有無法辨識的內容，請人工確認畫底線的部分",
};

const PART_LABEL: Record<keyof AddressParts, string> = {
  postalCode: "郵遞區號",
  city: "縣市",
  area: "鄉鎮市區",
  village: "村里",
  neighborhood: "鄰",
  road: "路街",
  section: "段",
  lane: "巷",
  alley: "弄",
  subAlley: "衖",
  number: "號",
  numberSuffix: "附號",
  floor: "樓",
  floorSuffix: "之",
  room: "室",
};

/**
 * Every warning carries the fragment it is about in `text`, and what the
 * library used instead in `resolved`, so none of this reads the English
 * `message` — that wording is the library's to change.
 */
function describeWarning(w: ParseWarning): { text: string; level: "info" | "warn" | "bad" } {
  switch (w.code) {
    case "city-alias":
    case "area-alias":
      return { text: `「${w.text}」已改制為「${w.resolved}」，已依新名稱翻譯`, level: "info" };
    case "city-inferred-from-area":
      return { text: `未輸入縣市，依「${w.text}」推得「${w.resolved}」`, level: "info" };
    case "postal-code-mismatch":
      return {
        text: `郵遞區號與行政區不符${w.resolved ? `（此區應為 ${w.resolved}）` : ""}，已照原樣保留，請確認`,
        level: "bad",
      };
    case "unparsed-remainder":
      return { text: `無法辨識「${w.text}」，這段沒有被翻譯`, level: "bad" };
  }
}

function romanization(): Romanization {
  const checked = document.querySelector<HTMLInputElement>('input[name="romanization"]:checked');
  const value = checked?.value;
  return value === "tongyong" || value === "wade-giles" ? value : "hanyu";
}

/** English with non-exact segments underlined, built by walking the segments in order. */
function renderEnglish(result: FormatResult): void {
  englishEl.replaceChildren();
  let cursor = 0;
  for (const segment of result.segments) {
    const at = result.english.indexOf(segment.value, cursor);
    if (at === -1) continue;
    englishEl.append(result.english.slice(cursor, at));
    if (segment.confidence === "exact") englishEl.append(segment.value);
    else {
      const span = document.createElement("span");
      span.className = `seg-${segment.confidence}`;
      span.textContent = segment.value;
      englishEl.append(span);
    }
    cursor = at + segment.value.length;
  }
  englishEl.append(result.english.slice(cursor));
}

function renderSegments(result: FormatResult): void {
  segmentsEl.replaceChildren();
  for (const segment of result.segments) {
    const tr = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = PART_LABEL[segment.key];
    const value = document.createElement("td");
    value.textContent = segment.value;
    const dot = document.createElement("td");
    const mark = document.createElement("span");
    mark.className = `dot ${segment.confidence}`;
    // A bare <span> is a generic element, and ARIA ignores aria-label on those —
    // without a role the confidence marks are invisible to a screen reader, and
    // shape is then the only non-colour channel.
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", STATUS[segment.confidence]);
    dot.append(mark);
    tr.append(label, value, dot);
    segmentsEl.append(tr);
  }
}

function addIssue(text: string, level: "info" | "warn" | "bad"): void {
  const li = document.createElement("li");
  li.className = level;
  li.textContent = text;
  issuesEl.append(li);
}

/**
 * `choices` are city names the district could belong to. Offering them as
 * buttons turns a dead end into one tap — on a phone, retyping a city name is
 * the difference between finishing and giving up.
 */
function showError(text: string, choices: string[] = []): void {
  resultEl.hidden = true;
  errorTextEl.textContent = text;
  errorChoicesEl.replaceChildren();
  for (const city of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = city;
    button.addEventListener("click", () => {
      // The city goes after any leading postal code, not in front of it:
      // parse() only reads a code at the very start, so prepending ahead of one
      // would make the whole address unreadable.
      const current = addressEl.value.trim();
      const zip = /^\d{3}(?:-?\d{2,3})?(?![0-9])/.exec(current)?.[0] ?? "";
      addressEl.value = zip + city + current.slice(zip.length);
      run();
      addressEl.focus();
    });
    errorChoicesEl.append(button);
  }
  errorChoicesEl.hidden = choices.length === 0;
  errorEl.hidden = false;
}

function run(): void {
  const input = addressEl.value.trim();
  clearEl.hidden = input.length === 0;
  if (input.length === 0) {
    resultEl.hidden = true;
    errorEl.hidden = true;
    return;
  }
  const result = translate(input, {
    romanization: romanization(),
    country: countryEl.checked,
  });
  if (result.error) {
    if (result.error.code === "area-ambiguous") {
      const cities = result.error.candidates ?? [];
      showError(
        cities.length > 0
          ? "這個鄉鎮市區在好幾個縣市都有，請選一個："
          : "這個鄉鎮市區在好幾個縣市都有，請在最前面加上縣市名稱或郵遞區號。",
        cities,
      );
    } else {
      showError("找不到縣市。請從縣市開始輸入，例如「臺北市大安區忠孝東路四段1號」。");
    }
    return;
  }

  statusEl.className = `status ${result.confidence}`;
  statusEl.textContent = STATUS[result.confidence];
  renderEnglish(result);
  renderSegments(result);

  issuesEl.replaceChildren();
  const warnings = result.warnings ?? [];
  for (const w of warnings) {
    const { text, level } = describeWarning(w);
    addIssue(text, level);
  }
  // `translate` puts the uninterpreted remainder in `unresolved` as well as
  // raising a warning about it, so without this the page would say "we guessed
  // the pinyin" directly under "this was not translated at all", about the same
  // text. Consume one remainder per fragment rather than filtering by value, so
  // a road that happens to read the same as the remainder keeps its own note.
  const remainders = warnings.flatMap((w) =>
    w.code === "unparsed-remainder" ? (w.text ?? []) : [],
  );
  for (const fragment of result.unresolved) {
    const at = remainders.indexOf(fragment);
    if (at !== -1) {
      remainders.splice(at, 1);
      continue;
    }
    addIssue(`「${fragment}」不在官方清單，英文是依字音推估的`, "warn");
  }

  errorEl.hidden = true;
  resultEl.hidden = false;
  copyEl.textContent = "複製英文地址";
  copyEl.classList.remove("done");
}

let timer: number | undefined;
addressEl.addEventListener("input", () => {
  clearEl.hidden = addressEl.value.length === 0;
  clearTimeout(timer);
  timer = window.setTimeout(run, 200);
});

addressEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    goEl.click();
  }
});

goEl.addEventListener("click", () => {
  clearTimeout(timer);
  run();
  addressEl.blur();
  const target = resultEl.hidden ? errorEl : resultEl;
  if (!target.hidden) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

clearEl.addEventListener("click", () => {
  addressEl.value = "";
  run();
  addressEl.focus();
});

for (const chip of document.querySelectorAll<HTMLButtonElement>(".chip")) {
  chip.addEventListener("click", () => {
    addressEl.value = chip.dataset.example ?? "";
    run();
  });
}

for (const input of document.querySelectorAll<HTMLInputElement>('input[name="romanization"]')) {
  input.addEventListener("change", run);
}
countryEl.addEventListener("change", run);

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers: select the paragraph and use the legacy command.
    const range = document.createRange();
    range.selectNodeContents(englishEl);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const ok = document.execCommand("copy");
    selection?.removeAllRanges();
    return ok;
  }
}

copyEl.addEventListener("click", async () => {
  const ok = await copyText(englishEl.textContent ?? "");
  copyEl.textContent = ok ? "已複製 ✓" : "無法複製，請長按文字選取";
  copyEl.classList.toggle("done", ok);
  setTimeout(() => {
    copyEl.textContent = "複製英文地址";
    copyEl.classList.remove("done");
  }, 2000);
});

/*
 * Offline support. Everything this app needs is already in the bundle, and the
 * moments it is most wanted — abroad, at a post office counter, in an airport
 * before buying a data plan — are exactly the ones with no network. The worker
 * only exists in a production build; `vite dev` serves no sw.js.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // A failed registration must never break the page: it still works online.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

// Deep link: ?q=<address>&r=hanyu|tongyong|wade-giles — lets other sites hand an address over.
const params = new URLSearchParams(location.search);
const q = params.get("q");
const r = params.get("r");
if (r === "hanyu" || r === "tongyong" || r === "wade-giles") {
  const radio = document.querySelector<HTMLInputElement>(
    `input[name="romanization"][value="${r}"]`,
  );
  if (radio) radio.checked = true;
}
if (q) {
  addressEl.value = q;
  run();
}
