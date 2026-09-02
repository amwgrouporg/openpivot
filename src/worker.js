// OpenPivot Worker: same-origin sensor routes over the open web's public record,
// plus static assets for the board.
//
// AI-BRAIN: the model on the other side of WebMCP decides which pivot to run and what
// a result means. This Worker is deterministic sensors only. It never interprets.
// REDTEAM: pending
import { ok, indeterminate, jsonResponse } from "./envelope.js";
import { normalizeHostname, normalizeIp, parseHttpUrl, clampInt, shortText } from "./validate.js";
import { dnsSensor, ptrSensor } from "./sensors/dns.js";
import { rdapSensor } from "./sensors/rdap.js";
import { certsSensor } from "./sensors/certs.js";
import { waybackSensor, archiveNowSensor } from "./sensors/wayback.js";
import { urlscanSensor } from "./sensors/urlscan.js";
import { ipSensor } from "./sensors/ip.js";
import { searchSensor } from "./sensors/search.js";
import { wikidataSensor } from "./sensors/wikidata.js";
import { extractSensor } from "./sensors/extract.js";
import { buildQueries } from "./queries.js";
export { Limiter } from "./limiter_do.js";

const SENSORS = ["dns", "ptr", "rdap", "certs", "wayback", "archive", "urlscan", "ip", "search", "wikidata", "extract", "queries"];
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function bad(sensor, message) {
  return jsonResponse(indeterminate(sensor, null, `invalid input: ${message}`), { status: 400 });
}

// Returns { limited, retry_after }. Layer 1 is the Durable Object (exact, shared across
// every isolate). Layer 2 is the Cloudflare rate-limit binding. Either layer throwing
// fails closed: a broken limiter is never an open door.
export async function rateLimited(request, env) {
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (env.LIMITER?.idFromName) {
    try {
      const stub = env.LIMITER.get(env.LIMITER.idFromName(key));
      const res = await stub.fetch("https://limiter/", { method: "POST", body: JSON.stringify({ limit: RATE_LIMIT, window_ms: RATE_WINDOW_MS }) });
      const verdict = await res.json();
      if (verdict.allowed === false) return { limited: true, retry_after: verdict.retry_after ?? 60 };
      if (verdict.allowed !== true) return { limited: true, retry_after: 60 };
    } catch {
      return { limited: true, retry_after: 60 };
    }
  }
  if (env.RATE_LIMITER?.limit) {
    try {
      const { success } = await env.RATE_LIMITER.limit({ key });
      if (!success) return { limited: true, retry_after: 60 };
    } catch {
      return { limited: true, retry_after: 60 };
    }
  }
  return { limited: false, retry_after: 0 };
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const p = (k) => url.searchParams.get(k);

  if (route === "health") {
    return jsonResponse({
      ok: true,
      sensors: SENSORS,
      secrets_present: { brave: Boolean(env.BRAVE_API_KEY), ipinfo: Boolean(env.IPINFO_TOKEN), urlscan: Boolean(env.URLSCAN_API_KEY) },
      rate_limit: { per_client_per_minute: RATE_LIMIT, durable_object: Boolean(env.LIMITER?.idFromName), binding: Boolean(env.RATE_LIMITER?.limit) },
    });
  }

  const rl = await rateLimited(request, env);
  if (rl.limited) {
    return jsonResponse(indeterminate(route, null, `rate limited: ${RATE_LIMIT} sensor calls per minute per client; retry after ${rl.retry_after}s`), { status: 429, headers: { "retry-after": String(rl.retry_after) } });
  }

  switch (route) {
    case "dns": {
      const name = normalizeHostname(p("name"));
      if (!name) return bad("dns", "name must be a hostname");
      return jsonResponse(await dnsSensor(name));
    }
    case "ptr": {
      const ip = normalizeIp(p("ip"));
      if (!ip) return bad("ptr", "ip must be an IPv4 or IPv6 address");
      return jsonResponse(await ptrSensor(ip));
    }
    case "rdap": {
      const q = p("q");
      const ip = normalizeIp(q);
      if (ip) return jsonResponse(await rdapSensor("ip", ip));
      const name = normalizeHostname(q);
      if (!name) return bad("rdap", "q must be a hostname or IP");
      return jsonResponse(await rdapSensor("domain", name));
    }
    case "certs": {
      const name = normalizeHostname(p("domain"));
      if (!name) return bad("certs", "domain must be a hostname");
      return jsonResponse(await certsSensor(name));
    }
    case "wayback": {
      const raw = p("url");
      const target = normalizeHostname(raw) ?? parseHttpUrl(raw)?.href;
      if (!target) return bad("wayback", "url must be a hostname or http(s) URL");
      return jsonResponse(await waybackSensor(target, undefined));
    }
    case "archive": {
      if (request.method !== "POST") return bad("archive", "POST required");
      let body;
      try { body = await request.json(); } catch { return bad("archive", "JSON body required"); }
      const target = parseHttpUrl(body?.url);
      if (!target) return bad("archive", "url must be a public http(s) URL");
      return jsonResponse(await archiveNowSensor(target.href));
    }
    case "urlscan": {
      const name = normalizeHostname(p("domain"));
      if (!name) return bad("urlscan", "domain must be a hostname");
      return jsonResponse(await urlscanSensor(name, env.URLSCAN_API_KEY));
    }
    case "ip": {
      const ip = normalizeIp(p("ip"));
      if (!ip) return bad("ip", "ip must be an IPv4 or IPv6 address");
      return jsonResponse(await ipSensor(ip, env.IPINFO_TOKEN));
    }
    case "search": {
      const q = shortText(p("q"), 400);
      if (!q) return bad("search", "q required");
      return jsonResponse(await searchSensor(q, env.BRAVE_API_KEY, clampInt(p("count"), 1, 20, 10)));
    }
    case "wikidata": {
      const q = shortText(p("q"), 200);
      if (!q) return bad("wikidata", "q required");
      return jsonResponse(await wikidataSensor(q));
    }
    case "extract": {
      const target = parseHttpUrl(p("url"));
      if (!target) return bad("extract", "url must be a public http(s) URL");
      return jsonResponse(await extractSensor(target, undefined, { origin: url.origin, assets: env.ASSETS }));
    }
    case "queries": {
      const q = shortText(p("q"), 200);
      if (!q) return bad("queries", "q required");
      const type = ["domain", "ip", "url", "org", "document", "claim", "text"].includes(p("type")) ? p("type") : "text";
      return jsonResponse(ok("queries", null, { input: q, type, queries: buildQueries(q, type) }));
    }
    default:
      return jsonResponse(indeterminate(route || "api", null, "unknown route"), { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (e) {
        return jsonResponse(indeterminate("api", null, `worker error: ${e?.message ?? e}`), { status: 500 });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
