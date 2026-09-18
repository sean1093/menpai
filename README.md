# menpai

門牌 *ménpái* — the address plate on a Taiwanese house. **menpai** rewrites that address in the English format used by Chunghwa Post and the UPU.

```ts
import { translate } from "menpai";

translate("台北市大安區忠孝東路四段1號3樓之2").english;
// → "3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)"

translate("106070 臺北市大安區忠孝東路四段216巷27弄1-1號3樓之2, 5室").english;
// → "Rm. 5, 3 F.-2, No. 1-1, Aly. 27, Ln. 216, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106070, Taiwan (R.O.C.)"

translate("高雄市三民區民族一路100號", { romanization: "tongyong" }).english;
// → "No. 100, Minzu 1st Rd., Sanmin Dist., Kaohsiung City 807, Taiwan (R.O.C.)"
```

**zero dependencies · 138 kB gzipped (ESM bundle, all data included) · offline · ESM + CJS · TypeScript**

Every result says how sure it is:

```ts
const r = translate("台北市信義區不存在的路99號");
r.english;     // "No. 99, Bucunzaide Rd., Xinyi Dist., Taipei City 110, Taiwan (R.O.C.)"
r.confidence;  // "inferred"  — the road is not in the official list; its pinyin is a guess
r.unresolved;  // ["不存在的路"]
r.segments;    // [{ key: "number", value: "No. 99", confidence: "exact" },
               //  { key: "road", value: "Bucunzaide Rd.", confidence: "inferred" }, ...]
```

A wrong address gets a parcel lost. This library would rather tell you "I am not sure" than pretend.

**Try it in the browser:** https://sean1093.github.io/menpai/ — mobile-first, accepts `?q=<address>` as a deep link, and **works offline**: a service worker precaches the whole app on first load, so it still runs in airplane mode or on a foreign SIM with no data. It can be added to a phone's home screen.

## Install

```sh
npm install menpai
```

Node ≥ 18, browsers, and edge runtimes. Pure functions, no I/O, no side effects at import time.

## API

Three functions. Nothing else is exported besides their types.

### `translate(input, options?) → FormatResult`

`parse` followed by `format`. If part of the input could not be interpreted (a building name, a note), it is appended to `unresolved` and `confidence` drops to `"unknown"` — a confident answer is never returned for text that was ignored.

If the input cannot be parsed at all, `english` is `""`, `confidence` is `"unknown"`, `unresolved` holds the whole input, and **`error` says why**:

```ts
translate("忠孝東路四段1號").error;
// { code: "city-not-found", message: "No city or county found at the start of the address." }

translate("大安區中山路1號").error;
// { code: "area-ambiguous", message: '"大安區" exists in more than one city (臺北市, 臺中市); …' }
```

Anything `parse` wanted to warn about comes through in **`warnings`**, so you never have to call `parse` separately just to find out what happened:

```ts
translate("桃園縣中壢市中央西路二段30號").warnings;
// [{ code: "city-alias", … }, { code: "area-alias", … }]  — 桃園縣 → 桃園市, 中壢市 → 中壢區
```

Both are omitted when there is nothing to report, and `format` never sets either — it is given parts, not text.

### `parse(input) → ParseResult`

Chinese address → structured parts.

```ts
const p = parse("桃園縣中壢市中央西路二段30號");
// {
//   ok: true,
//   parts: { city: "桃園市", area: "中壢區", road: "中央西路", section: "2", number: "30" },
//   unparsed: "",
//   warnings: [
//     { code: "city-alias", message: '"桃園縣" was read as "桃園市".' },
//     { code: "area-alias", message: '"中壢市" was read as "中壢區".' }
//   ]
// }
```

Accepted input variations: `臺` / `台`, full-width digits, Chinese numerals (`四段`, `十二樓`, `二百一十六巷`), `3F` / `3F-2` for `3樓之2`, basement floors written `地下2樓` / `地下二樓` / `B2` / `B2F` / `B2樓`, lettered units (`A室`, `A1室`, `3樓之B`; house-number suffixes stay numeric), `1-1號` / `1之1號` / `1號之1`, 3 / 3+2 / 3+3 postal codes with or without a hyphen, whitespace and commas anywhere, pre-2010/2014 county and township names (`臺北縣板橋市` → `新北市板橋區`), a missing city when the district name is unique in Taiwan, and a district that exists in several cities when the postal code settles it.

`ok: false` is returned only when no city can be determined:

| `error.code` | Meaning |
| --- | --- |
| `empty-input` | Nothing to parse. |
| `city-not-found` | No city / county at the start, and no unique district either. |
| `area-ambiguous` | e.g. `大安區…` alone — exists in 臺北市 and 臺中市; add the city or a postal code. `error.candidates` lists them, so you can offer the choice. |

`warnings[].code`: `city-alias`, `area-alias`, `city-inferred-from-area`, `postal-code-mismatch` (the code in the input does not belong to that district; it is kept, not corrected), `unparsed-remainder`.

### `format(parts, options?) → FormatResult`

Structured parts → English. Use it directly when the address already lives in separate fields.

```ts
format({ city: "新北市", area: "板橋區", road: "文化路", section: "1", number: "188", floor: "12" }).english;
// → "12 F., No. 188, Sec. 1, Wenhua Rd., Banqiao Dist., New Taipei City 220, Taiwan (R.O.C.)"
```

### Types

```ts
interface AddressParts {
  postalCode?: string;   // "106" | "10607" | "106070"
  city?: string;         // 臺北市
  area?: string;         // 大安區 / 民雄鄉 / 竹北市
  village?: string;      // 豊收村 / 龍門里
  neighborhood?: string; // 鄰 number
  road?: string;         // 忠孝東路 (路 / 街 / 大道, or a place name)
  section?: string;      // 段 number (or a named section)
  lane?: string;         // 巷 number (or a named lane)
  alley?: string;        // 弄
  subAlley?: string;     // 衖
  number?: string;       // 號
  numberSuffix?: string; // 附號: the 1 in 1之1號
  floor?: string;        // 樓; basement floors are "B1", "B2", … → "B1 F."
  floorSuffix?: string;  // the 2 in 3樓之2; may be a letter ("B" in 3樓之B)
  room?: string;         // 室; may be a letter ("A", "A1")
}

interface FormatOptions {
  romanization?: "hanyu" | "tongyong" | "wade-giles"; // default "hanyu"
  postalCode?: 3 | 5 | 6;  // digits to emit; default: as many as are known
  country?: boolean;       // append ", Taiwan (R.O.C.)"; default true
}

type Confidence = "exact" | "inferred" | "unknown";

interface FormatResult {
  english: string;
  confidence: Confidence;  // the lowest confidence of all segments
  segments: Array<{ key: keyof AddressParts; value: string; confidence: Confidence }>;
  unresolved: string[];    // Chinese fragments rendered by a fallback (or left as-is)
  error?: ParseError;      // translate() only, and only when english is ""
                           //   .candidates lists the cities for area-ambiguous
  warnings?: ParseWarning[]; // translate() only, omitted when empty
}
```

## Confidence

| Level | Meaning |
| --- | --- |
| `exact` | The name is in the official Chunghwa Post list, or the segment is a structural token (`No.`, `Sec.`, `F.`) whose form is fixed by the Chunghwa Post writing guideline. |
| `inferred` | Produced by a fallback: character-by-character pinyin plus suffix rules (`路` → `Rd.`, trailing `東` → `E.`, `一路` → `1st Rd.`). Also every Wade-Giles conversion, since no official reference exists for it. The Chinese fragment is listed in `unresolved`. |
| `unknown` | Could not be translated (a character with no reading, a postal code that contradicts the district, text that was not understood), or a number no real address would carry (`0 F.`, `1200 F.`, `No. 0`). The value is passed through so a human can see it. |

The overall `confidence` is the minimum over segments.

## Output format

Follows the order and abbreviations of the Chunghwa Post writing guideline, small to large:

`Rm.` 室 → `F.` 樓 (`3 F.-2` for 3樓之2, `B1 F.` for 地下1樓) → `No.` 號 (`No. 1-1` for 1之1號) → `Sub-Alley` 衖 → `Aly.` 弄 → `Ln.` 巷 → `Sec.` 段 → road (`Rd.` 路, `St.` 街, `Blvd.` 大道; `E.` / `W.` / `S.` / `N.`; `1st` / `2nd` …) → `Neighborhood` 鄰 → `Vil.` 村/里 → `Dist.` 區 / `Township` 鄉·鎮 / `City` 縣轄市 → city or county + postal code → `Taiwan (R.O.C.)`.

Conventional spellings are used where Chunghwa Post uses them: `Taipei`, `New Taipei`, `Kaohsiung`, `Keelung`, `Hsinchu`, `Taichung`, `Chiayi`, `Pingtung`, `Kinmen`, `Hualien`, `Taitung`, `Lienchiang`, `Tamsui Dist.`, `Lukang Township`, `East Dist.`, `Roosevelt Rd.`, `Civic Blvd.`, `Keelung Rd.`. Multi-reading characters follow the official list, not a generic pinyin algorithm: `重慶北路` is `Chongqing N. Rd.`, `廈門街` is `Xiamen St.`.

Romanization applies to names that are not conventional: `hanyu` (default, the official system), `tongyong` (`Jhongsiao`, `Banciao`), `wade-giles` in the simplified Taiwan form without aspiration marks, diaereses or hyphens (`Chunghsiao`, `Hsinyi`).

## Verification

- **Official data replay** — every one of the 30,030 road rows, 8,369 village / named-lane rows and 371 district rows of the vendored Chunghwa Post files is pushed through `format()` and must come back byte-for-byte (`test/data.test.ts`). The fallback rules are pinned to the official spellings.
- **Property-based** — random combinations of real districts, roads, villages and numbers are written out in random spellings (臺/台, Chinese / full-width numerals, `3F`, `1-1號`, stray spaces and commas), parsed back, and must format identically (`fast-check`, `test/roundtrip.property.test.ts`).
- **Golden cases against the official web tool** — `test/fixtures/golden.json` holds addresses covering every city, multi-reading roads, sections, lanes, alleys, floors, suffixes, same-named districts, Tongyong, and roads outside the official list. Their `expected` values are filled in by hand from the Chunghwa Post translation tool, which a human has to operate. **Status: 0 of 127 verified.** The test run states the count, so it is never in doubt, and a test checks that number against this sentence:

  ```
  ✓ golden: official Chunghwa Post output > 0/127 cases verified against the official tool (0%)
  ```

  A case whose `expected` is still `null` cannot assert the official spelling, but it is not inert: **every** case, verified or not, must still parse, produce a non-empty address, and come back at the confidence it declares, so a fixture that regresses fails CI today. The file is guarded too — every city must be reached by a case that is a real street address, there are no duplicates, dates must be real dates, and the verified count cannot fall below `VERIFIED_FLOOR`. Resetting a verified case to `null` therefore also means editing `test/golden.test.ts`, where a reviewer will see it.

### Contributing a verified case

1. Put the Chinese address into the [official translation tool](https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=207).
2. Copy its output verbatim into `expected` for the matching case in `test/fixtures/golden.json`, and add `verifiedAt` (ISO date) and `source`. Both are required — when the data edition changes (currently 113/01) they are what tells you which cases need re-checking.
3. Raise `VERIFIED_FLOOR` in `test/golden.test.ts` by one. Never lower it.

If the address is one menpai cannot resolve confidently — a road outside the official list — add `"confidence": "inferred"` (or `"unknown"`) to the case. Those are the most valuable cases to verify, because the fallback spelling is exactly what has no official reference.

If the library disagrees with the tool, that is a bug worth an issue rather than an `expected` bent to fit.

## Command line

```sh
npx menpai "台北市大安區忠孝東路四段1號3樓之2"
# 3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)

# one address per line, for a spreadsheet column
menpai < addresses.txt > english.txt || echo "some need checking"

# machine-readable: one JSON object per line
menpai --json "台北市信義區不存在的路99號"
```

Addresses go to stdout, notes and warnings to stderr, so a pipe stays clean. The exit status is the batch verdict: `0` when every address came back `exact`, `1` when at least one is `inferred` or `unknown` and wants a human, `2` for a usage error.

`--romanization <hanyu|tongyong|wade-giles>`, `--postal-code <3|5|6>` (trims; it never adds digits the input did not carry), `--no-country`, `--json`, `--quiet`, `--help`, `--version`. Run `menpai --help` for the full text.

Output is one line per non-blank input line — a row that fails still emits an empty line, so line *n* out stays line *n* in.

## Using it in a checkout, CRM, or label printer

See [`docs/integration.md`](docs/integration.md): where to run it, what to do with each `confidence` level, and a ~40-line zero-dependency HTTP endpoint for non-JavaScript stacks ([`examples/http-server.mjs`](examples/http-server.mjs), [`examples/cloudflare-worker.mjs`](examples/cloudflare-worker.mjs)).

## Non-goals

- Address existence validation. `臺北市大安區忠孝東路四段99999號` translates fine; whether the house exists is not this library's business.
- Postal code lookup or reverse lookup. 3-digit codes come with the district; 3+2 / 3+3 codes are only passed through from the input.
- English → Chinese.
- Calling the Chunghwa Post website at runtime. Everything is offline.
- Configuration files, plugins, custom dictionaries.
- Addresses outside Taiwan.

## Data

All names come from files published by Chunghwa Post (中華郵政) on its [download page](https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201): the road list (edition 113/01, 2024-04-01), the village and named-lane list (113/01), and the city / district list with postal codes (109/06). The vendored copies, URLs and checksums are in [`data/source/`](data/source/SOURCE.md); the reasoning behind the data layout is in [`docs/data-notes.md`](docs/data-notes.md). `npm run build:data` regenerates `src/data/` and CI fails if the committed output drifts.

[donma/TaiwanAddressCityAreaRoadChineseEnglishJSON](https://github.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON) (MIT) was the starting point of this project; its data turned out to be from 2016, so the current official files are used instead. See [`NOTICE`](NOTICE).

## License

MIT © Sean Chou. Data © Chunghwa Post Co., Ltd.; see `NOTICE`.
