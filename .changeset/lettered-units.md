---
"menpai": minor
---

Parse lettered unit designators. `A室`, `A1室`, `3樓之B` and `3F-B` now yield `room: "A"` / `floorSuffix: "B"` (upper-cased) and print as `Rm. A` / `3 F.-B`, instead of landing in `unparsed` and taking the whole result down to `confidence: "unknown"`.

The form is deliberately narrow — one Latin letter plus up to two digits, and not followed by a block marker — so `AB室`, `A123室`, `會議室`, `B2A室` (no separator) and `3樓之B棟` are still reported rather than half-read.

House-number suffixes are unaffected and stay numeric: `1之A號` is still not parsed.
