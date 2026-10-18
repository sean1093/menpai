# Test plan

How menpai is tested, what each layer is responsible for, and what is knowingly
not covered. Written as a working document: the gap register at the bottom is
the part that should change.

## What failure looks like here

menpai converts addresses. The dangerous failure is not a crash or an obviously
wrong string — it is a **grammatically valid English address with a piece
missing**, returned at `confidence: "exact"`. Nobody double-checks a result that
looks right, so a lost floor or a swallowed road reaches an envelope.

Every bug found in the 0.2.0 cycle was that shape:

| Bug | What it returned |
| --- | --- |
| `B1棟5樓` read as floor `B1` | a valid address, with the real floor gone |
| `福星里福星北一街1號` matched a compound dictionary key | village, road **and** house number all lost |
| Candidate-city button prepended ahead of a postal code | `Taipei City, Taiwan (R.O.C.)` — street address gone |
| Digit runs past 15 characters | `Infinity F.`, at `exact` |

So the tests are built around one question: **can a change drop part of an
address and still look fine?** Assertions compare whole reassembled addresses
rather than individual fields, because a field-by-field check passes on exactly
the output the bug produced.

## Layers

| Layer | File | What it is responsible for |
| --- | --- | --- |
| Unit — parser | `parse.test.ts` | Each grammar rule, and the shapes that must *not* parse |
| Unit — formatter | `format.test.ts` | Part order, abbreviations, romanization, plausibility ceilings |
| Unit — codec | `codec.test.ts` | The front-coded dictionary format, both directions |
| Unit — romanization | `romanize.test.ts` | Hanyu / Tongyong / Wade-Giles, tone and apostrophe rules |
| Contract | `translate.test.ts` | The public result shape: `error`, `warnings`, `segments`, `unresolved` |
| Corpus — format | `data.test.ts` | All 30,030 official road rows, 8,369 village rows, 371 districts out of `format()` byte-for-byte |
| Corpus — parse | `data-parse.test.ts` | The same corpus *into* `parse()`, reassembled and compared; plus referential integrity of the district/city tables |
| Property | `roundtrip.property.test.ts` | Generated addresses survive parse → format → parse |
| Golden | `golden.test.ts` | Hand-verified official output, with a floor that can only rise |
| CLI | `cli.test.ts` | `runCli` as a pure function: flags, exit codes, stdout vs stderr |
| CLI — process | `bin.test.ts` | The real binary: held-open stdin, closed stdout, exit status |
| UI | `site-ui.test.ts` | `site/src/main.ts` driven against the real `site/index.html` |
| UI — theme | `site-theme.test.ts` | Contrast ratios, focus rings, non-colour confidence channels |

### Why the two corpus layers are separate

`data.test.ts` replays the vendored Chunghwa Post files through `format()`. For
a long time that was described as "the official data is tested", and it was not:
nothing replayed the corpus through `parse()`, so 30,030 official road names
protected the formatter and said nothing about the parser.

The gap was load-bearing. Lowering `MAX_ROAD_LENGTH` from 16 to 10 passes every
other test in this suite and silently drops the house number from five real road
names. `data-parse.test.ts` exists to notice that class of change.

It also tests the compound `<village><place>` road keys in both directions —
257 of them ship in the data — because that shape is what made a greedy match
swallow a village plus a fragment:

- **must stay whole**: `塘興村坪頂東巷` is `塘興村坪頂` + `東巷` lane.
- **must give the village up**: `福星里福星北一街` is `福星里` + `福星北一街`.

A test that only checked one direction would be satisfied by a parser that
always split, or never did.

## Rules

1. **Every bug fix arrives with a test that fails without it.** Not a test that
   exercises the area — one that fails.
2. **Mutation-test each new guard.** Break the thing on purpose and confirm the
   suite goes red, naming the test that caught it. A guard nothing proves is a
   comment.
3. **Assert the whole output.** `expect(parts.city)` passing is compatible with
   the rest of the address having vanished.
4. **Replay the corpus, don't sample it.** The vendored data is the only
   independent oracle in the repo; 30,030 rows cost 300 ms.
5. **A number is never the goal.** `src/bin.ts` would read as 0% because
   `bin.test.ts` spawns it as a process — the only way to test a held-open
   stdin — and a subprocess is invisible to the coverage provider. It is
   excluded from the report rather than "fixed" by replacing those tests with
   in-process ones that cannot see the bug that actually shipped.
6. **Never skip, disable or quarantine a test to get green.**

## Coverage

`npm run coverage`, and one CI leg runs it:

| | Statements | Branches |
| --- | --- | --- |
| `src/` | 100% | 93.12% |
| `site/src/` | 98.05% | 85.52% |
| Overall | 99.63% | 92.27% |

Excluded, deliberately: `src/types.ts` (declarations only) and `src/bin.ts` (see
rule 5).

The configured thresholds — 97% statements, 88% branches — are a floor a few
points below those numbers, not a target. They exist for one failure: the UI sat
at 0% and nothing said so. Losing that file's tests again takes overall
statements to 81%, which trips them.

Coverage is a smoke detector, not a grade. It found the UI at 0% — 322 lines
including the worst bug of the cycle — which was worth knowing. It cannot tell
whether an assertion is strong enough, which is what rules 2 and 3 are for: the
first version of the codec delimiter check in this very PR held four passing
assertions over a table that had been silently corrupted.

## Gap register

Known and accepted, highest-risk first. These are the things to pick up next.

| # | Gap | Risk | Note |
| --- | --- | --- | --- |
| 1 | `golden.test.ts` has 0 of 127 cases verified against the official tool; `VERIFIED_FLOOR` is 0 | **High** — the suite is self-referential. Every other layer asserts internal consistency, or checks official *name* spellings; only a golden case catches a composition rule that is confidently wrong | Needs a human to operate the Chunghwa Post web tool, which has no API. `npm run golden:worksheet` / `golden:ingest` reduce it to the lookups: 121 hanyu cases and 6 tongyong. Never fill `expected` from menpai's own output — that makes the file assert menpai equals menpai, and the floor locks it in |
| 2 | Branch coverage in `src/text.ts` (85%) and `src/derive.ts` (86%) | Medium — these are the normalization and derivation helpers every other layer depends on | Uncovered branches are mostly defensive early returns |
| 3 | No test runs the published artefact's type declarations | Medium — `exports`/`types` wiring breaks silently; `scripts/check-dist.mjs` checks file presence, not that a consumer's `tsc` resolves | Would need a fixture package that imports the tarball |
| 4 | Service worker (`site/sw-template.js`) has no runtime test | Medium — a wrong cache strategy strands users on a stale dictionary offline | Build-time guards in `site/vite.config.ts` check the precache list; install/activate/fetch behaviour is unexercised |
| 5 | `site/src/main.ts:303-307`, the service-worker registration | Low | Guarded by `import.meta.env.PROD`, unreachable under test |
| 6 | `site/src/main.ts:178`, the "ambiguous with no candidates" message | Low — unreachable, kept as defence | Traced rather than guessed: `parse()` returns `area-ambiguous` only with two or more candidates, and builds the city list by mapping each to a name and dropping the empties, so an empty list needs a district row pointing at a city that does not exist. `data-parse.test.ts` now asserts none does, which makes the branch unreachable *and* keeps it worth having if the data ever regresses. Leave it uncovered |
| 7 | `--country` is accepted but absent from `--help` | Low | Covered by a test; the help text is the thing to fix |
| 8 | `encodeList` does not escape tab or newline in a key | Low — latent, now detected | A tab inside a Chinese name splits it into a shorter name plus a fabricated English override, and the damaged table still re-encodes byte-for-byte. `codec.test.ts` detects it by keeping the two columns apart — no Han character in the English, no Latin letter in the Chinese — rather than by looking for a delimiter, which cannot see it. Hardening the encoder to throw is still the better fix |
| 9 | Two official road names carry full-width digits in their English | Low — data, not code | `Nanshi Sec. １, Zhongfeng Rd.` and `147th N. ４th Ln., Minzu St.` come out of the source file that way, and will print as-is. Normalizing them in `scripts/build-data.ts` would diverge from the official spelling, so this needs a decision rather than a patch |
| 10 | No performance regression test | Low | The corpus replays would show a gross slowdown as a timeout, nothing finer |

## Running things

```sh
npm test                  # the whole suite
npm run coverage          # the table above
npx vitest run test/data-parse.test.ts   # one file
npx vitest                # watch
```

The UI tests need a DOM, so `site-ui.test.ts` opts into jsdom with a
`@vitest-environment` pragma; everything else runs in node. `site/src/main.ts`
imports the library by package name, exactly as a consumer does, so
`vitest.config.ts` carries the same `menpai` alias as `site/vite.config.ts`.

Two constraints worth knowing before changing the setup:

- **jsdom is held at `^26`**, the last line that declares `node >= 18`. CI runs
  the suite on 18, 20, 22 and 24 because the package claims `engines.node >= 18`;
  jsdom 27 and later require Node 20+, so bumping it would either break the
  Node 18 leg or mean dropping a version the package says it supports.
- **`test/site-ui.test.ts` is typechecked by `test/tsconfig.dom.json`**, not the
  root config, which omits the DOM lib on purpose so nothing in `src/` can reach
  for a browser global. The root config excludes that one file; `npm run
  typecheck` runs all three projects.
