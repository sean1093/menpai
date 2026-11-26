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
const liveEl = $<HTMLParagraphElement>("live");
const examplesEl = $<HTMLElement>("examples");

const STATUS: Record<Confidence, string> = {
  exact: "已對照中華郵政官方資料",
  inferred: "有部分名稱不在官方清單，以拼音推估，請確認畫底線的部分",
  unknown: "有無法辨識的內容，請人工確認畫底線的部分",
};

/** Per-segment labels for the confidence marks. Terse on purpose: see renderSegments. */
const MARK: Record<Confidence, string> = {
  exact: "官方資料",
  inferred: "拼音推估",
  unknown: "請人工確認",
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
    case "area-inferred-from-postal-code":
      return { text: `未輸入鄉鎮市區，依郵遞區號 ${w.text} 推得「${w.resolved}」`, level: "info" };
    case "area-city-mismatch":
      // The most common address mistake there is, and the one the user can
      // actually fix: name the right city and everything else parses.
      return {
        text: `「${w.text}」不屬於你填的縣市${w.resolved ? `，它在「${w.resolved}」` : ""}，請改成正確的縣市`,
        level: "bad",
      };
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
    value.lang = "en";
    value.textContent = segment.value;
    const dot = document.createElement("td");
    const mark = document.createElement("span");
    mark.className = `dot ${segment.confidence}`;
    // A bare <span> is a generic element, and ARIA ignores aria-label on those —
    // without a role the confidence marks are invisible to a screen reader, and
    // shape is then the only non-colour channel.
    mark.setAttribute("role", "img");
    // A short label, not STATUS: that is a page-level instruction, and reusing
    // it named up to fifteen cells "有無法辨識的內容，請人工確認畫底線的部分",
    // which cannot be skimmed and points at underlining in another element.
    mark.setAttribute("aria-label", MARK[segment.confidence]);
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

function run(showErrors = true): void {
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
    // While typing, an incomplete address is not an error worth a card.
    if (!showErrors) {
      resultEl.hidden = true;
      errorEl.hidden = true;
      return;
    }
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

  /*
   * The status line is keyed on the *cause*, not on `confidence` alone.
   *
   * It used to say 「請確認畫底線的部分」 — check the underlined part — for
   * every non-exact result. But when the only problem is text we could not
   * place, that text never reaches the English output, so `renderEnglish` has
   * nothing to mark and there is no underline to check. Two very different
   * situations got the same red banner and no way to tell them apart:
   *
   *   …市政路100號 王小明 0912345678  → a correct address with a name attached
   *   …忠孝東洛四段1號 (one wrong char) → house number, section and road lost
   *
   * The first is the common case by far — a name or phone pasted from a
   * messaging app — and a red alarm on a right answer teaches people to
   * distrust the tool. The second is the one that actually needs a human.
   */
  const doubtful = result.segments.filter((s) => s.confidence !== "exact");
  const dropped = (result.warnings ?? []).some((w) => w.code === "unparsed-remainder");
  /*
   * Whether what survived is still an address — which is what actually
   * separates the two cases. Both of these drop a remainder and have no
   * doubtful segment:
   *
   *   …市政路100號 王小明 0912345678   keys: number road area city   benign
   *   …忠孝東洛四段1號 (one wrong char) keys:        road area city   lost
   *
   * The house number is the tell. Without it nothing can be delivered, so a
   * remainder that swallowed it is the serious case however tidy the English
   * looks. My first version of this check missed that and called the second
   * one benign; the test for it is what caught that.
   */
  const keys = new Set(result.segments.map((s) => s.key));
  const deliverable = keys.has("number") && (keys.has("road") || keys.has("village"));
  const benign = dropped && deliverable && doubtful.length === 0;
  const level: Confidence = benign
    ? "inferred"
    : doubtful.length > 0 || dropped
      ? "unknown"
      : "exact";
  statusEl.className = `status ${level}`;
  statusEl.textContent = benign
    ? "地址本身翻好了，有一段沒被翻譯（通常是姓名、電話或大樓名稱），請看下面說明"
    : dropped && !deliverable
      ? "有一段無法辨識，門牌號碼也沒有讀到，這個地址不完整，請人工確認"
      : doubtful.length > 0
        ? STATUS[result.confidence]
        : STATUS.exact;
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
  // A number no real address would carry makes its own segment unknown without
  // putting anything in `unresolved` or raising a warning. The segment is
  // underlined either way, but the list should say why.
  for (const segment of result.segments) {
    if (segment.confidence !== "unknown") continue;
    if (result.unresolved.some((fragment) => segment.value.includes(fragment))) continue;
    addIssue(`「${segment.value}」不是合理的${PART_LABEL[segment.key]}，請人工確認`, "bad");
  }

  errorEl.hidden = true;
  resultEl.hidden = false;
  copyEl.textContent = "複製英文地址";
  copyEl.classList.remove("done");
  /*
   * One short sentence, not the whole card. The result region carries the
   * status line, the English, a copy button, the issue list and up to fifteen
   * table rows; announcing all of it on every keystroke pause was the other
   * half of the old behaviour. The English is marked `lang="en"` so it is read
   * with an English voice rather than as phoneme soup.
   */
  announce(
    level === "exact"
      ? `已轉換：${result.english}`
      : `已轉換，但有需要確認的地方：${result.english}`,
  );
}

/** Replaces the live region's text, re-marking the English part of it. */
function announce(text: string): void {
  liveEl.replaceChildren();
  const at = text.indexOf("：");
  if (at === -1) {
    liveEl.textContent = text;
    return;
  }
  liveEl.append(text.slice(0, at + 1));
  const english = document.createElement("span");
  english.lang = "en";
  english.textContent = text.slice(at + 1);
  liveEl.append(english);
}

/*
 * The examples sit directly under the textarea, so on a phone one mis-tap used
 * to replace a pasted address with no confirmation and no undo — and getting it
 * back means switching apps and copying again. They hide once there is
 * something to lose, mirroring the clear button's own logic.
 */
const syncExamples = (): void => {
  examplesEl.hidden = addressEl.value.trim().length > 0;
};

let timer: number | undefined;
addressEl.addEventListener("input", () => {
  clearEl.hidden = addressEl.value.length === 0;
  syncExamples();
  clearTimeout(timer);
  // `false`: typing is not a request for an error message. An assertive card
  // telling someone "找不到縣市" while they are still typing the city is noise,
  // and for a screen-reader user it interrupted their own typing echo.
  timer = window.setTimeout(() => run(false), 200);
});

addressEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    goEl.click();
  }
});

/** Honours the reader's motion preference; a full-page animated scroll is the one vestibular trigger here. */
const reveal = (target: HTMLElement): void => {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
};

goEl.addEventListener("click", () => {
  clearTimeout(timer);
  run();
  const target = resultEl.hidden ? errorEl : resultEl;
  if (target.hidden) return;
  /*
   * Focus the result rather than `addressEl.blur()`. The blur existed to
   * dismiss the mobile keyboard, which moving focus to another element also
   * does — but blur left focus on <body>, so there was no visible ring
   * anywhere, a keyboard user's next Tab restarted at the masthead, and a
   * screen-reader user had no cursor to read from.
   */
  target.focus();
  reveal(target);
});

clearEl.addEventListener("click", () => {
  addressEl.value = "";
  syncExamples();
  run();
  addressEl.focus();
});

for (const chip of document.querySelectorAll<HTMLButtonElement>(".chip")) {
  chip.addEventListener("click", () => {
    addressEl.value = chip.dataset.example ?? "";
    syncExamples();
    run();
  });
}

// Wrapped, not passed directly: `run` takes a parameter, so a bare reference
// would hand it the Event object as `showErrors`.
for (const input of document.querySelectorAll<HTMLInputElement>('input[name="romanization"]')) {
  input.addEventListener("change", () => run());
}
countryEl.addEventListener("change", () => run());

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
  /*
   * Two changes from the obvious version.
   *
   * The button's own label stays put. Mutating the label of the control you
   * just pressed changes its accessible name, which screen readers announce
   * inconsistently and voice-control users navigate by — "點 複製英文地址"
   * stopped working for two seconds because the name they could see no longer
   * existed. The confirmation goes to the live region instead.
   *
   * And it only turns green on a result we actually stand behind. The
   * clipboard gets flat text with the underlines gone, so the copy is the
   * moment the uncertainty is lost — and a green tick was the last thing the
   * reader saw before pasting a guessed spelling into a visa form.
   */
  const sure = statusEl.classList.contains("exact");
  copyEl.classList.toggle("done", ok && sure);
  announce(
    ok
      ? sure
        ? "已複製英文地址"
        : "已複製英文地址，但其中有推估或無法確認的部分，請再核對"
      : "無法複製，請長按或選取英文地址再複製",
  );
  setTimeout(() => copyEl.classList.remove("done"), 2000);
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

/*
 * Deep link: `#q=<address>&r=hanyu|tongyong|wade-giles`, with `?q=` still
 * accepted so existing links keep working.
 *
 * The fragment is the preferred form because a fragment is never sent in an
 * HTTP request. With `?q=`, a cold load — a freshly clicked shared link, or any
 * visit before the service worker is installed — sends the address to the host
 * and its CDN, where it lands in access logs this project does not control.
 * The page tells the reader, in Chinese, that the address is never sent to any
 * server; with a query string that sentence was false exactly once per link,
 * on the visit that matters.
 *
 * Either form is then stripped from the URL, so the address stops riding along
 * in the address bar, in the history entry, in whatever the reader bookmarks
 * next, and in the omnibox suggestions that surface it on a shared machine.
 */
const deepLink = new URLSearchParams(
  location.hash.startsWith("#") ? location.hash.slice(1) : location.search,
);
const q = deepLink.get("q");
const r = deepLink.get("r");
if (r === "hanyu" || r === "tongyong" || r === "wade-giles") {
  const radio = document.querySelector<HTMLInputElement>(
    `input[name="romanization"][value="${r}"]`,
  );
  if (radio) radio.checked = true;
}
if (q) {
  addressEl.value = q;
  syncExamples();
  if (location.search || location.hash) {
    history.replaceState(null, "", location.pathname);
  }
  run();
}
