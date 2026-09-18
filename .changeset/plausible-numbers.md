---
"menpai": minor
---

Stop calling implausible numbers `exact`. A floor of `0`, `1200` or `B99`, a house number of `0`, a lane of `999999` — none of these can be a real address, and reporting them as `exact` is exactly the pretending the library says it does not do. They now come back `unknown`, with the value still passed through so a human can see what was meant.

Also fixes an overflow: past 15 digits `Number()` returns `Infinity`, so a long run of digits produced `Infinity F.` at `confidence: "exact"`. Numbers that long are now kept as written.

The ceilings are deliberately generous (floor 170, basement 10, number and lane 99999, section 99, neighborhood 999) — the point is to refuse an impossible value, not to validate addresses. Taiwan's tallest building has 101 floors; the official road list tops out at section 8 and lane 430.
