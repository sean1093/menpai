---
"menpai": minor
---

Parse basement floors. `地下2樓`, `地下二樓`, `B2`, `B2F` and `B2樓` (with an optional `之N` / `-N` suffix) now yield `floor: "B2"` and print as `B2 F.`, instead of being dropped into `unparsed` and taking the whole result down to `confidence: "unknown"`.
