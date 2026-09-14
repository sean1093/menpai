# Source data

Vendored copies of the official Chunghwa Post files, converted from Big5 to UTF-8
without any other change. `scripts/build-data.ts` reads only these files.

| File | Official name | Edition | URL | SHA-256 (UTF-8 copy) |
| --- | --- | --- | --- | --- |
| `roads.csv` | 路街中英對照文字檔 (中英文街路名稱對照檔1130401.TXT) | 113/01 (2024-04-01) | https://www.post.gov.tw/post/download/%E4%B8%AD%E8%8B%B1%E6%96%87%E8%A1%97%E8%B7%AF%E5%90%8D%E7%A8%B1%E5%B0%8D%E7%85%A7%E6%AA%941130401.TXT | `5b3a2152b61f6b49aa04e03cff4594d59fa8d5c24069e95a75b0d28a12c4cab9` |
| `villages.csv` | 村里文字巷中英對照文字檔 (村里文字巷中英對照.TXT) | 113/01 | https://www.post.gov.tw/post/download/%E6%9D%91%E9%87%8C%E6%96%87%E5%AD%97%E5%B7%B7%E4%B8%AD%E8%8B%B1%E5%B0%8D%E7%85%A7.TXT | `629c6e29264572fb88447614b38cc100ed57f7e1d6fe54cb75ab277989d093be` |
| `county.xml` | 縣市鄉鎮中英對照 Xml 檔 (County_h_10906.xml) | 109/06 (2020-06-12) | https://www.post.gov.tw/post/download/County_h_10906.xml | `24acfe52023f0ddc2149a2f8368910cd0968584913f3ac17678abb3048cba1b9` |

Original Big5 downloads: `roads` SHA-256 `9716f9ebc13671410266d194d54eb359890c3c8dd49cb91944550a147f9b7e7e`,
`villages` SHA-256 `8edc33df9b8f0b7ec99a4bd3271d2e7bd7579ba1ea62ef2b6dfe082bf16d897e`. Fetched 2026-09-14.

To refresh: download the current files from
https://www.post.gov.tw/post/internet/Download/all_list.jsp?ID=2201 (section 6),
convert with `iconv -f BIG5-HKSCS -t UTF-8`, replace the files here, run
`npm run build:data`, then `npm test` (`test/data.test.ts` replays every row).
