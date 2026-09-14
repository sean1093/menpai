// Same endpoint as http-server.mjs, as a Cloudflare Worker (also works unchanged
// as a Vercel Edge Function or Deno Deploy handler: menpai has no Node imports).
//
//   npm install menpai
//   npx wrangler deploy cloudflare-worker.mjs --name menpai-api --compatibility-date 2024-09-01
//   curl "https://menpai-api.<you>.workers.dev/translate?q=台北市大安區忠孝東路四段1號3樓之2"
import { format, parse } from "menpai";

const ROMANIZATIONS = new Set(["hanyu", "tongyong", "wade-giles"]);
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=86400",
};

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/translate") {
      return Response.json(
        { error: { code: "not-found", message: "GET /translate?q=<address>" } },
        { status: 404, headers: HEADERS },
      );
    }
    const q = url.searchParams.get("q") ?? "";
    const r = url.searchParams.get("romanization") ?? "hanyu";
    const parsed = parse(q);
    if (!parsed.ok)
      return Response.json({ error: parsed.error }, { status: 422, headers: HEADERS });
    const result = format(parsed.parts, {
      romanization: ROMANIZATIONS.has(r) ? r : "hanyu",
      country: url.searchParams.get("country") !== "false",
    });
    if (parsed.unparsed) {
      result.unresolved.push(parsed.unparsed);
      result.confidence = "unknown";
    }
    return Response.json(
      { ...result, parts: parsed.parts, warnings: parsed.warnings },
      { headers: HEADERS },
    );
  },
};
