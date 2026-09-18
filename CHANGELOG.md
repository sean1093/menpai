# menpai

## 0.2.0

Parsing gets considerably less lossy: basement floors, lettered units and
compound village/road dictionary keys were all silently dropping part of an
address while still returning a confident-looking result. There is also a new
`menpai` CLI, and `translate()` now tells you why it failed.

Two things to know before upgrading:

- **`confidence` changes for some inputs that previously said `exact`.** A floor
  of `0` or `1200`, a house number of `0`, or a digit run long enough to overflow
  to `Infinity` now report `unknown`. If you route on `confidence === "exact"`,
  these stop passing — which is the point, but it is a change in behaviour.
- **Results can carry two new optional keys.** `translate()` sets `warnings` on
  roughly a fifth of real inputs and `error` when parsing fails outright. Both
  are omitted when empty, so this only matters against a strict schema, a
  fixed-column insert, or a stored snapshot.

### Minor Changes

- f990bf7: `ParseError` gains `candidates` for `area-ambiguous`: the city names the district could belong to, as structured data rather than only inside an English sentence. A caller can now offer the choice instead of asking the user to work out which cities were meant.

  Also fixes a bug on the same path: when the input carried a postal code matching none of the candidates, the list was emptied and the message read `exists in more than one city ()`. A code that matches nothing says nothing about which city was meant, so the candidates are now kept.

  The `candidates` order follows the official city table, and the list is never empty for `area-ambiguous`. Districts that exist in three or four cities (`東區` is in four) are handled the same way.

- 4e9a50c: Parse basement floors. `地下2樓`, `地下二樓`, `地下2層`, `B2F` and `B2樓` (with an optional `之N` / `-N` suffix) now yield `floor: "B2"` and print as `B2 F.`, instead of being dropped into `unparsed` and taking the whole result down to `confidence: "unknown"`.

  A bare `B2`, with no `樓` / `F` / `層` to confirm it, is only read as a floor when it ends the address or is followed by a separated room (`B2 5室`). Block labels such as `B1棟5樓`, `B2號` and `B25室` stay in `unparsed` — inventing a basement floor there would also discard the real one.

- 4a02147: Add a CLI. `npx menpai "台北市大安區忠孝東路四段1號"` translates one address; with no argument it reads stdin and translates a line at a time, so a CSV column can be piped through it.

  Exit status carries the result: `0` when every address came back `exact`, `1` when any needs a human, `2` for a usage error — so a batch script can write `menpai < in.txt > out.txt || review.sh` without parsing the output. Addresses go to stdout and notes to stderr, keeping pipes clean. `--json` emits one object per line including `confidence` and `segments`.

  The bin is transpiled rather than bundled, so it imports the library at runtime and the dictionaries are not shipped twice. Still zero dependencies — argv parsing is hand-rolled.

  The whole batch is held in memory, so this suits a spreadsheet column rather than a multi-million-row export.

- 2f0d687: Parse lettered unit designators. `A室`, `A1室`, `3樓之B` and `3F-B` now yield `room: "A"` / `floorSuffix: "B"` (upper-cased) and print as `Rm. A` / `3 F.-B`, instead of landing in `unparsed` and taking the whole result down to `confidence: "unknown"`.

  The form is deliberately narrow — one Latin letter plus up to two digits, and not followed by a block marker — so `AB室`, `A123室`, `會議室`, `B2A室` (no separator) and `3樓之B棟` are still reported rather than half-read.

  House-number suffixes are unaffected and stay numeric: `1之A號` is still not parsed.

- b960cb0: Stop calling implausible numbers `exact`. A floor of `0`, `1200` or `B99`, a house number of `0`, a lane of `999999` — none of these can be a real address, and reporting them as `exact` is exactly the pretending the library says it does not do. They now come back `unknown`, with the value still passed through so a human can see what was meant.

  Also fixes an overflow: past 15 digits `Number()` returns `Infinity`, so a long run of digits produced `Infinity F.` at `confidence: "exact"`. Numbers that long are now kept as written.

  The ceilings are deliberately generous (floor 170, basement 10, number and lane 99999, section 99, neighborhood 999) — the point is to refuse an impossible value, not to validate addresses. Taiwan's tallest building has 101 floors; the official road list tops out at section 8 and lane 430.

- 4b65be7: `ParseWarning` gains `text` — the input fragment the warning is about — and `resolved`, what the library used instead where there is one. Both optional, so nothing breaks.

  This is how you tell a fragment the library _guessed_ at from one it _skipped_. Both appear in `FormatResult.unresolved`, but only a skipped one has an `unparsed-remainder` warning naming it, and that warning has no `resolved`. Without this, a consumer rendering both lists says opposite things about the same text — "could not interpret this" directly above "romanized by rule" — which is what the web UI and the CLI were each working around by pattern-matching the English `message`.

  Build your own copy from `code`, `text` and `resolved`. The wording of `message` is not part of the contract.

- e16fa21: `translate()` no longer throws away what `parse()` learned. `FormatResult` gains two optional fields: `error`, set when the input could not be parsed at all, and `warnings`, carrying the renamed-county, inferred-city and postal-code-mismatch notes through on success.

  Before this, `translate()` returned `english: ""` with no way to tell `city-not-found` from `area-ambiguous`, and dropped every warning — so anyone building a real UI had to bypass `translate()` and call `parse()` + `format()` instead.

  Both fields are optional and omitted when empty, so `format()` and every existing result shape are unchanged. One thing to know if you feed `translate()` output straight into a strict schema (a zod `.strict()` object, a fixed-column insert, a stored snapshot): roughly a fifth of real inputs raise a warning, and those results now carry an extra key.

### Patch Changes

- 18d2725: Fix compound "village + road" dictionary keys swallowing the real road. The official list carries entries like `福星里福星` ("Fuxing, Fuxing Vil."), and a greedy match on one of those consumed the village name plus a fragment, stranding the rest: `臺北市中正區福星里福星北一街1號` parsed as road `福星里福星` with `北一街1號` unparsed — losing the village, the road and the house number at once.

  The village is now taken only when all three hold: it is a real dictionary village (so an official road like `美村路` is never cut into `美村` + `路西巷`), the road found after it reads further than the compound's own tail, and the split does not orphan a structural marker (`塘興村坪頂東巷` keeps `東巷` as its lane rather than reading `坪頂東` and stranding the `巷`). `七里橋` is still one road, with or without a lane after it, and a compound key with nothing longer after it is still used as-is.

  This was also the cause of an intermittent property-test failure that had been reading as CI noise.

## 0.1.0

### Minor Changes

- 396e475: Initial release: `parse`, `format`, and `translate` for Taiwan addresses with Chunghwa Post English output, per-segment confidence, and Hanyu / Tongyong / Wade-Giles romanization.
