---
"menpai": minor
---

Add a CLI. `npx menpai "台北市大安區忠孝東路四段1號"` translates one address; with no argument it reads stdin and translates a line at a time, so a CSV column can be piped through it.

Exit status carries the result: `0` when every address came back `exact`, `1` when any needs a human, `2` for a usage error — so a batch script can write `menpai < in.txt > out.txt || review.sh` without parsing the output. Addresses go to stdout and notes to stderr, keeping pipes clean. `--json` emits one object per line including `confidence` and `segments`.

The bin is transpiled rather than bundled, so it imports the library at runtime and the dictionaries are not shipped twice. Still zero dependencies — argv parsing is hand-rolled.
