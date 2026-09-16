import {
  type AddressParts,
  type Confidence,
  type FormatResult,
  format,
  type ParseWarning,
  parse,
  type Romanization,
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

const quoted = (message: string): string[] =>
  [...message.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");

function describeWarning(w: ParseWarning): { text: string; level: "info" | "warn" | "bad" } {
  const q = quoted(w.message);
  switch (w.code) {
    case "city-alias":
      return { text: `「${q[0]}」已改制為「${q[1]}」，已依新名稱翻譯`, level: "info" };
    case "area-alias":
      return { text: `「${q[0]}」已改制為「${q[1]}」，已依新名稱翻譯`, level: "info" };
    case "city-inferred-from-area":
      return { text: `未輸入縣市，依「${q[1]}」推得「${q[0]}」`, level: "info" };
    case "postal-code-mismatch": {
      const expected = /expected (\d{3})/.exec(w.message)?.[1];
      return {
        text: `郵遞區號與行政區不符${expected ? `（此區應為 ${expected}）` : ""}，已照原樣保留，請確認`,
        level: "bad",
      };
    }
    case "unparsed-remainder":
      return { text: `無法辨識「${q[0]}」，這段沒有被翻譯`, level: "bad" };
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

function showError(text: string): void {
  resultEl.hidden = true;
  errorTextEl.textContent = text;
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
  const parsed = parse(input);
  if (!parsed.ok) {
    if (parsed.error.code === "area-ambiguous") {
      showError("這個鄉鎮市區在好幾個縣市都有，請在最前面加上縣市名稱或郵遞區號。");
    } else {
      showError("找不到縣市。請從縣市開始輸入，例如「臺北市大安區忠孝東路四段1號」。");
    }
    return;
  }
  const result = format(parsed.parts, { romanization: romanization(), country: countryEl.checked });
  let confidence = result.confidence;
  if (parsed.unparsed.length > 0) confidence = "unknown";

  statusEl.className = `status ${confidence}`;
  statusEl.textContent = STATUS[confidence];
  renderEnglish(result);
  renderSegments(result);

  issuesEl.replaceChildren();
  for (const w of parsed.warnings) {
    const { text, level } = describeWarning(w);
    addIssue(text, level);
  }
  for (const fragment of result.unresolved) {
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
