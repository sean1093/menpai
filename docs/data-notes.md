# Data notes

What was inspected before writing any code, and what it decided.

## 1. The planned source: `donma/TaiwanAddressCityAreaRoadChineseEnglishJSON`

Inspected at commit `233bff2` (2026-04-16).

| Fact | Finding |
| --- | --- |
| License | No `LICENSE` file. An MIT notice ("版權所有 (c) 2016 Donma") was added to `README.md` on 2026-04-15. |
| Attribution requirement | README names the Chunghwa Post download page as the source; it asks for nothing beyond MIT. |
| Data freshness | `AllData.json` was last changed on **2016-02-24** (commit "所有資料"). Every later commit touches only README / preview. |
| Shape | 24 "cities" (22 real ones plus 釣魚臺 and 南海島) → 374 areas → 43,263 road rows. Fields: `CityName`, `CityEngName`, `AreaList[].ZipCode / AreaName / AreaEngName`, `RoadList[].RoadName / RoadEngName`. |
| Sections | `RoadEngName` **does** contain the section: `忠孝東路４段` → `Sec. 4, Zhongxiao E. Rd.`. Section digits are full-width (`１段`), never Chinese numerals. 3,672 rows have a numeric section; 92 have a named section (`文山路亞東段` → `Sec. Yadong, Wunshan Rd.`), written inconsistently (`Dong Sec. 1, …` vs `… Sec.`). |
| Apostrophes | Curly `’` (1,730 rows: `Da’an`, `Ren’ai`). |
| Romanization | Hanyu with a handful of Tongyong leftovers (`Wunshan`) and conventional names (`Roosevelt Rd.`, `Civic Blvd.`, `Keelung Rd.`). |
| Postal codes | 3-digit only. No 3+2 / 3+3. |
| Non-road entries | ~6,500 rows are place names rather than roads (`下寮`, `十四甲`, `三貂里頂坑` → `Dingkeng, Sandiao Vil.`), plus named lanes (`中正路中正巷`) and a few `Market` / `Bridge` / `Bldg.` entries. |
| Same road, different English | Only 10 Chinese names map to more than one English form across areas (mostly section-naming artefacts, plus `大學路` = `Daxue Rd.` / `University Road`). A global name → English dictionary is therefore nearly lossless. |

Compared against the road lists Chunghwa Post serves today for each of the 371 districts (51,864 entries): 40,254 entries match, **11,610 current entries are missing from donma**, and 3,006 donma entries no longer exist. Ten years of new roads and renames.

## 2. The source actually used: Chunghwa Post download files

Chunghwa Post publishes the same data directly, and it is current. Section 6 of
<https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201>:

| File | Edition | Rows | Notes |
| --- | --- | --- | --- |
| 中英文街路名稱對照檔 (`roads.csv`) | 113/01, dated 2024-04-01 | 30,030 (30,009 unique) | Global `中文街路名稱,英文街路名稱`; **no city / district column**. Sections use Chinese numerals (`忠孝東路四段`) and the base road is listed separately (`忠孝東路`). Straight apostrophes. 11 entries still use full-width digits (`民族街１４７北一巷`). |
| 村里文字巷中英對照檔 (`villages.csv`) | 113/01 | 8,369 | 5,145 villages (村/里) and 3,216 named lanes (`一村巷` → `Yicun Ln.`), plus 8 odd place names. Each line is quoted whole (`"一心里,""Yixin Vil."""`). |
| 縣市鄉鎮中英對照檔 (`county.xml`) | 109/06 | 371 | `zip3`, `縣市鄉鎮`, `English`. Includes 釣魚台 (290) and 東沙/南沙群島 under 高雄市 with city English `Nanhai Islands`. Curly apostrophes (10). |

Both text files are Big5; `data/source/` holds UTF-8 conversions with checksums (see `SOURCE.md`).

Decision: build from the official files; donma is credited in `NOTICE` as a design reference only. The trade-off is losing the per-district scoping donma had — but the official global list has no conflicts worth scoping (see §1), and "does this road exist in this district" is address validation, which is a non-goal.

## 3. What the build does (`scripts/build-data.ts`)

1. Normalizes keys: full-width → ASCII, `台` → `臺`, Chinese-numeral sections → digits (`忠孝東路四段` → `忠孝東路4段`), curly → straight apostrophes.
2. Folds sections: an entry `X<n>段` whose English is `Sec. <n>, <English of X>` is dropped (2,632 entries) because it is reconstructible; 383 base roads that only existed in sectioned form are added. 3 sectioned entries whose English is *not* `Sec. n, ` + base are kept as their own keys (`大學路1段` → `Sec. 1, University Road` while `大學路` → `Daxue Rd.`).
3. Merges named lanes from the village file into the road list (same lookup position in an address).
4. Builds a per-character Hanyu Pinyin table for every Big5 hanzi plus every character used by the data (13,008 characters) with `pinyin-pro` at build time only.
5. Runs the rule-based derivation (`src/derive.ts`) over every entry and stores the official English **only where the rule disagrees**: 2,268 of 28,912 road entries, 115 of 5,144 villages. Everything else is reproduced by rule at runtime, and `test/data.test.ts` replays all 30,030 + 8,369 + 371 source rows through `format()` to prove it.
6. Front-codes the sorted key lists (shared-prefix length + suffix per line), which cuts the road list from 120 kB to 80 kB gzipped.

Runtime cost: the tables are decoded lazily on the first call; importing the package only loads string constants.

## 4. Things the data cannot do (and the library therefore does not claim)

- **3+2 / 3+3 postal codes**: not in any of the files. The library passes through whatever the input carries and never invents digits.
- **Villages in the official web tool**: the tool at `index.jsp?ID=207` has no village / neighborhood field and silently drops them, so golden cases containing 村/里/鄰 cannot be verified there. The village file is the only official reference for `Vil.` spellings.
- **Wade-Giles**: no official file or tool emits it. Output is generated by syllable rules and is capped at `inferred`.
- **Named sections / lanes not in the list**: rendered by rule (`Sec. <Pinyin>`, `<Pinyin> Ln.`) and marked `inferred`.
- **Characters outside Big5 with no reading**: kept in place and marked `unknown`.

## 5. Quirks preserved on purpose

- `文山路亞東段` → `Sec. Yadong, Wunshan Rd.` (Tongyong spelling inside the Hanyu file) is emitted verbatim: the official list is the authority for listed names.
- `豊收村` → `Lishou Vil.` per the village file, although the character is usually read `feng` as a variant of 豐.
- `金門街` → `Jinmen St.` while the county is `Kinmen County`: conventional spellings are per name, not per character.
