---
"menpai": patch
---

Web UI: stop showing a red alarm on a correct answer, make the result legible
to a screen reader, and keep the deep link's promise.

The status line is keyed on the *cause*, not on `confidence` alone. It used to
say 「請確認畫底線的部分」 — check the underlined part — for every non-exact
result, and when the only problem is text that could not be placed, that text
never reaches the English output, so there is no underline to check. A name or
phone pasted along with the address is the common case; the English comes out
perfect and the page raised a red alarm anyway, which teaches people to
distrust it. Worse, the same banner covered the case where part of the address
itself was lost. Those are now different messages, separated by whether what
survived still has a house number — without one nothing can be delivered,
however tidy the English looks.

Accessibility of the result, all of it previously missing:

- The English output is marked `lang="en"`. It is the one thing this app
  produces, and a Mandarin voice read it as phoneme soup.
- Announcements go to a persistent `role="status"` node. `aria-live` sat on a
  section that was `display:none` until it had content, which is the unreliable
  form of the pattern — silent on the first conversion, then announcing all
  fifteen table rows on the second.
- Converting moves focus to the result instead of calling `blur()`, which had
  left focus on `<body>` with no ring anywhere and the next Tab restarting at
  the masthead.
- The segment table has a caption, column headers and row scopes; each
  confidence mark is labelled 官方資料 / 拼音推估 / 請人工確認 instead of
  repeating a page-level instruction in up to fifteen cells.
- A `forced-colors` block, so focus rings, the selected romanization and the
  Taiwan (R.O.C.) switch stay visible in Windows High Contrast — all three were
  carried by box-shadows and background fills the UA overrides.
- The error card is `role="status"`, not `role="alert"`, and the debounce no
  longer raises errors at all: an assertive card interrupted a screen-reader
  user's own typing echo every 200 ms while the address was merely incomplete.
- Section headings and a group name for the examples, so there is something to
  navigate by; `prefers-reduced-motion` now covers the scroll.

Deep links prefer `#q=<address>`, and either form is stripped from the URL once
read. A fragment is never sent in an HTTP request; with `?q=` a cold load — a
freshly clicked shared link — sent the address to the host and its CDN, while
the page says in Chinese that it never leaves your device. A CSP with
`connect-src 'none'` now makes that claim something the browser enforces rather
than prose.

Also: copying no longer turns the button green on a result with guessed or
unreadable parts, and keeps its own label so voice control can press it again;
the example chips hide once there is a paste to lose, instead of silently
replacing it on a mis-tap.
