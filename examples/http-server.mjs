// Minimal HTTP endpoint around menpai. Zero dependencies; Node >= 18.
//
//   npm install menpai
//   node http-server.mjs
//   curl "http://localhost:8787/translate?q=台北市大安區忠孝東路四段1號3樓之2"
//
// Response (200):
//   { "english": "...", "confidence": "exact" | "inferred" | "unknown",
//     "segments": [...], "unresolved": [...], "parts": {...}, "warnings": [...] }
// Response (422) when no city could be found: { "error": { "code", "message" } }
import { createServer } from "node:http";
import { format, parse } from "menpai";

const PORT = Number(process.env.PORT ?? 8787);
const ROMANIZATIONS = new Set(["hanyu", "tongyong", "wade-giles"]);

function translateRequest(url) {
  const q = url.searchParams.get("q") ?? "";
  const r = url.searchParams.get("romanization") ?? "hanyu";
  const romanization = ROMANIZATIONS.has(r) ? r : "hanyu";
  const country = url.searchParams.get("country") !== "false";
  const parsed = parse(q);
  if (!parsed.ok) return { status: 422, body: { error: parsed.error } };
  const result = format(parsed.parts, { romanization, country });
  if (parsed.unparsed) {
    result.unresolved.push(parsed.unparsed);
    result.confidence = "unknown";
  }
  return { status: 200, body: { ...result, parts: parsed.parts, warnings: parsed.warnings } };
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=86400", // pure function of the query string
  };
  if (req.method !== "GET" || url.pathname !== "/translate") {
    res
      .writeHead(404, headers)
      .end(JSON.stringify({ error: { code: "not-found", message: "GET /translate?q=<address>" } }));
    return;
  }
  const { status, body } = translateRequest(url);
  res.writeHead(status, headers).end(JSON.stringify(body));
}).listen(PORT, () => {
  console.log(`menpai listening on http://localhost:${PORT}/translate?q=...`);
});
