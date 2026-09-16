---
"menpai": minor
---

Parse basement floors. `地下2樓`, `地下二樓`, `地下2層`, `B2F` and `B2樓` (with an optional `之N` / `-N` suffix) now yield `floor: "B2"` and print as `B2 F.`, instead of being dropped into `unparsed` and taking the whole result down to `confidence: "unknown"`.

A bare `B2`, with no `樓` / `F` / `層` to confirm it, is only read as a floor when it ends the address or is followed by a separated room (`B2 5室`). Block labels such as `B1棟5樓`, `B2號` and `B25室` stay in `unparsed` — inventing a basement floor there would also discard the real one.
