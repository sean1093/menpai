---
"menpai": minor
---

`ParseWarning` gains `text` — the input fragment the warning is about — and `resolved`, what the library used instead where there is one. Both optional, so nothing breaks.

This is how you tell a fragment the library *guessed* at from one it *skipped*. Both appear in `FormatResult.unresolved`, but only a skipped one has an `unparsed-remainder` warning naming it, and that warning has no `resolved`. Without this, a consumer rendering both lists says opposite things about the same text — "could not interpret this" directly above "romanized by rule" — which is what the web UI and the CLI were each working around by pattern-matching the English `message`.

Build your own copy from `code`, `text` and `resolved`. The wording of `message` is not part of the contract.
