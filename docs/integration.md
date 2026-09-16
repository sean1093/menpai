# Integration guide

How to put menpai into a checkout flow, a CRM, a shipping-label printer, or any
other system that needs an English address for Taiwan. Everything here is a
pure function of the input string; there is no service to sign up for, no rate
limit, and nothing leaves your process.

## 1. Pick where it runs

| Your stack | Do this | Notes |
| --- | --- | --- |
| Node / Bun / Deno backend | `npm install menpai`, call `translate()` | 138 kB gzipped, all data inline. Node ≥ 18. |
| Browser checkout page (React, Vue, Svelte, plain JS) | `npm install menpai`, call it client-side | No network round-trip; works offline. Tree-shakes to nothing if unused. |
| Edge function (Cloudflare Workers, Vercel Edge, Deno Deploy) | Same package | No Node built-ins are used. |
| Anything else (PHP, Ruby, Java, .NET, a no-code platform) | Run [`examples/http-server.mjs`](../examples/http-server.mjs) or [`examples/cloudflare-worker.mjs`](../examples/cloudflare-worker.mjs) and call it over HTTP | ~40 lines each, zero dependencies besides menpai. |
| A human who just needs one address | Link to the web UI: `https://sean1093.github.io/menpai/?q=<address>` | Optional `&r=tongyong` / `&r=wade-giles`. |

## 2. The call

```ts
import { translate } from "menpai";

const r = translate(order.shippingAddress);
// r.english     "3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)"
// r.confidence  "exact" | "inferred" | "unknown"
// r.segments    [{ key: "road", value: "Zhongxiao E. Rd.", confidence: "exact" }, ...]
// r.unresolved  []   — Chinese fragments that had to be guessed or were skipped
// r.warnings    []   — notes that do not lower confidence (see §3); omitted when empty
// r.error            — why it could not be parsed at all; only when english is ""
```

Options: `{ romanization: "hanyu" | "tongyong" | "wade-giles", country: boolean, postalCode: 3 | 5 | 6 }`.
Hanyu is what Chunghwa Post uses; leave it unless the customer asks.

If your address is already split into fields, skip parsing and call `format()`
with an `AddressParts` object — see the README.

## 3. What to do with `confidence` (the part that matters)

Never treat the English string as final without looking at `confidence`. The
library is deliberately honest about what it could not verify.

| `confidence` | What happened | Recommended handling |
| --- | --- | --- |
| `exact` | Every name was found in the Chunghwa Post lists; every number is structural. | Use it. Print it on the label. |
| `inferred` | At least one name (road, village, district) is not in the official list and was romanized character by character. It is usually right for new roads, but it is a guess. | Use it, but show the customer the English and the guessed fragment(s) from `unresolved`, and let them edit. Do not silently print it on an international label. |
| `unknown` | Something could not be interpreted: a character with no reading, a postal code that contradicts the district, or trailing text such as a building name (`市政大樓`). | Stop. Show the customer what was not understood (`unresolved`) and ask them to fix the Chinese input. |

Handling pattern for a checkout form:

```ts
const r = translate(input);
if (r.confidence === "exact") return r.english;
if (r.confidence === "inferred") return askCustomerToConfirm(r.english, r.unresolved);
return askCustomerToFixInput(r.unresolved); // "unknown"
```

`translate()` also returns **`warnings`**: notes that do not lower confidence but
that you may want to surface — an outdated county name was mapped
(`桃園縣` → `桃園市`), the city was inferred from a district, or the postal
code in the input does not match the district (`postal-code-mismatch` — the
library keeps the customer's code and marks it `unknown` rather than
"correcting" it). The field is omitted when there is nothing to report.

When the input cannot be parsed at all, `english` is `""` and **`error`** says
why — `city-not-found`, `area-ambiguous` or `empty-input`. That is what lets you
ask for the missing piece rather than just saying "invalid address". Note that
`error` is the only reliable failure signal from `translate()`; `format()` also
returns `english: ""` for empty parts and never sets `error`.

One overlap to know about: trailing text that could not be interpreted appears
**both** in `unresolved` and as an `unparsed-remainder` warning. `unresolved` is
the authoritative list to show a customer — it is the union of "guessed" and
"skipped" fragments. The warning exists so you can tell the two apart when you
want to word the message differently.

## 4. Store both

Keep the customer's original Chinese address as the source of truth and store
the English rendering next to it together with `confidence` and the menpai
version. Re-run `translate()` when you upgrade menpai (the Chunghwa Post lists
change a few times a year) rather than editing stored English by hand.

Chunghwa Post accepts either script domestically. The English form is for
international senders, customs forms, and systems that cannot handle CJK text.

## 5. HTTP endpoint contract (for the two examples)

`GET /translate?q=<address>&romanization=hanyu|tongyong|wade-giles&country=true|false`

```jsonc
// 200
{
  "english": "3 F.-2, No. 1, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei City 106, Taiwan (R.O.C.)",
  "confidence": "exact",
  "segments": [{ "key": "floor", "value": "3 F.-2", "confidence": "exact" }, ...],
  "unresolved": [],
  "parts": { "city": "臺北市", "area": "大安區", "road": "忠孝東路", "section": "4", "number": "1", "floor": "3", "floorSuffix": "2" },
  "warnings": []
}
// 422 — no city could be determined
{ "error": { "code": "city-not-found", "message": "No city or county found at the start of the address." } }
```

Responses are a pure function of the query string, so put a CDN or a
`Cache-Control` header in front of it (the examples already send
`max-age=86400`). Both examples answer any origin (`Access-Control-Allow-Origin: *`);
tighten that if the endpoint is internal.

Run it:

```sh
npm install menpai
node examples/http-server.mjs                      # http://localhost:8787/translate?q=...
# or
npx wrangler deploy examples/cloudflare-worker.mjs --name menpai-api --compatibility-date 2024-09-01
```

## 6. No JavaScript? Use the CLI

For a one-off batch — a CSV column of Chinese addresses to turn into English — you do not need a service at all:

```sh
npx menpai < addresses.txt > english.txt || echo "some rows need checking"
npx menpai --json < addresses.txt > out.jsonl   # confidence and segments per row
```

Exit status `0` means every row came back `exact`; `1` means at least one needs a human. Notes go to stderr, so `> english.txt` stays clean.

## 7. Things menpai will not do for you

- Validate that a house number exists, or look up 3+2 / 3+3 postal codes. Use Chunghwa Post's own services for that; menpai passes a 3+3 code through if the customer typed it.
- Translate building names, block labels (`B1棟`), or free-text delivery notes. They come back in `unresolved` so you can show them, not lose them. (Basement *floors* — `地下一樓`, `B1` — are translated, to `B1 F.`)
- Guarantee the English for names outside the official lists. That is what `inferred` means.
