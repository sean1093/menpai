---
"menpai": minor
---

`translate()` no longer throws away what `parse()` learned. `FormatResult` gains two optional fields: `error`, set when the input could not be parsed at all, and `warnings`, carrying the renamed-county, inferred-city and postal-code-mismatch notes through on success.

Before this, `translate()` returned `english: ""` with no way to tell `city-not-found` from `area-ambiguous`, and dropped every warning — so anyone building a real UI had to bypass `translate()` and call `parse()` + `format()` instead. Both fields are optional and omitted when empty, so existing code is unaffected; `format()` never sets either.
