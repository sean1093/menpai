---
"menpai": minor
---

Stop returning confident addresses that Chunghwa Post could not deliver, and
stop letting one bad input cost a whole batch.

Six inputs that used to produce a wrong or incomplete address:

- **A district belonging to a different city was swallowed into the road name.**
  `臺北市板橋區文化路一段188號` rendered the fabricated road
  `Banqiaoquwenhua Rd.` with the district and postal code silently gone, no
  warning, and `confidence: "inferred"` — which the README frames as benign.
  Naming the wrong city for a district is the most common address mistake there
  is. The road fallback can no longer begin with a district token, and a new
  `area-city-mismatch` warning names the city the district does belong to, so a
  caller can offer the correction. The district is deliberately not adopted:
  moving the address to another city would be a bigger lie than refusing to
  guess. `新竹縣新竹市…` and `嘉義縣嘉義市…`, where a provincial city stands
  where a district should, are reported the same way.

- **`高雄縣三民鄉` resolved to `高雄市三民區`** — downtown Kaohsiung, about
  100 km from the right place, with the wrong postal code, at
  `confidence: "exact"`. 三民鄉 was renamed 那瑪夏鄉 in 2008 and is 那瑪夏區
  (849) today; the suffix-swap heuristic that correctly reads 板橋市 as 板橋區
  matched its stem to an unrelated district. Historical renames now take
  precedence over that heuristic.

- **A missing district is recovered from the postal code.** Dropping 區 is
  extremely common, and Chunghwa Post requires the district.
  `106臺北市忠孝東路四段1號` now fills in 大安區 with an
  `area-inferred-from-postal-code` warning instead of returning an address
  without it.

- **`臺灣省` / `福建省` prefixes parse.** `福建省金門縣` is the official 戶政
  spelling — it is what appears on an ID card and a 戶籍謄本 — and the whole
  address used to fail with `city-not-found`.

- **An en or em dash in the house number no longer loses it.** Word and most
  web editors autocorrect `-` to `–`, so `1–1號` arrives constantly; the entire
  house number was being dropped, which is the most delivery-fatal omission
  there is.

- **A whole 門牌 in the `number` field is accepted.** CRMs and 戶政 exports keep
  `1-1` in one column. The English was already correct, but `confidence` came
  back `unknown` with nothing in `unresolved` and no warning, so the caller was
  told to have a human review it for no stated reason.

Three inputs that used to monopolise a CPU. All are bounded now, and all were
reachable from the public API:

- `normalizeSections` is applied, unanchored and global, to the whole remainder
  of untrusted input. A long numeral run with no `段` made the engine retry the
  greedy run from every offset: 65,536 digits behind a city name took 2.0 s and
  256 KiB took 34 s, from one call. Now linear.
- `splitSyllables` searched syllable boundaries without memoising failures, so
  it was exponential — a 67-character name took 1.9 s and ~90 characters took
  minutes. Reachable through `format()` with `tongyong` or `wade-giles`.
- `deriveNamed`'s trailing-numeral match was quadratic on a name not ending in
  a numeral.

And three ways the library handled bad input badly:

- **`parse()` and `format()` no longer throw on a non-string.** A nullable
  address column used to raise a `TypeError`, taking down the whole job;
  `parse()` returns `invalid-input` and `format()` ignores non-string values.
- **Input over 1,000 characters is refused** with `input-too-long`.
- **The CLI strips terminal escapes from the address it echoes.** Batch-
  processing third-party address lists is what the CLI is for, and a crafted
  field could rewrite the window title, clear the screen over the warning above
  it, or write to the operator's clipboard via OSC 52.

Also: `prepare` replaces `prepublishOnly`, so `npm install` from a git URL or a
repacked mirror ships `dist/` instead of a package whose `main` and `bin` point
at nothing.
