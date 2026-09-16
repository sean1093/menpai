---
"menpai": minor
---

`ParseError` gains `candidates` for `area-ambiguous`: the city names the district could belong to, as structured data rather than only inside an English sentence. A caller can now offer the choice instead of asking the user to work out which cities were meant.

Also fixes a bug on the same path: when the input carried a postal code matching none of the candidates, the list was emptied and the message read `exists in more than one city ()`. A code that matches nothing says nothing about which city was meant, so the candidates are now kept.

The `candidates` order follows the official city table, and the list is never empty for `area-ambiguous`. Districts that exist in three or four cities (`東區` is in four) are handled the same way.
