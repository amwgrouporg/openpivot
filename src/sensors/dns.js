// DNS over HTTPS via Cloudflare. One query per record type, in parallel.
import { ok, indeterminate, fetchWithTimeout } from "../envelope.js";

const DOH = "https://cloudflare-dns.com/dns-query";
export const RECORD_TYPES = ["A", "AAAA", "NS", "MX", "TXT", "CNAME"];
const RCODES = { 0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 5: "REFUSED" };

export function dohUrl(name, type) {
  return `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
}

export async function queryType(name, type, fetcher = fetchWithTimeout) {
  const res = await fetcher(dohUrl(name, type), { headers: { accept: "application/dns-json" } }, 8000);
  if (!res.ok) throw new Error(`doh ${type}: http ${res.status}`);
  const body = await res.json();
  return normalizeAnswer(type, body);
}

// Pure. Turns a DoH JSON body into { rcode, records[] }.
export function normalizeAnswer(type, body) {
  const rcode = RCODES[body.Status] ?? `RCODE${body.Status}`;
  const answers = Array.isArray(body.Answer) ? body.Answer : [];
  const records = answers
    .filter((a) => a && typeof a.data === "string")
    .map((a) => {
      if (type === "MX") {
        const [pref, exchange] = a.data.split(/\s+/);
        const ex = stripDot(exchange ?? "");
        return ex ? { preference: Number(pref), exchange: ex, ttl: a.TTL } : { preference: Number(pref), exchange: null, null_mx: true, ttl: a.TTL };
      }
      if (type === "TXT") return { value: a.data.replace(/^"|"$/g, ""), ttl: a.TTL };
      if (type === "NS" || type === "CNAME") return { value: stripDot(a.data), ttl: a.TTL };
      return { value: a.data, ttl: a.TTL };
    });
  return { rcode, records };
}

function stripDot(s) {
  return typeof s === "string" && s.endsWith(".") ? s.slice(0, -1) : s;
}

export async function dnsSensor(name, fetcher = fetchWithTimeout) {
  const sourceUrl = dohUrl(name, "ANY").replace("&type=ANY", "");
  const results = await Promise.allSettled(RECORD_TYPES.map((t) => queryType(name, t, fetcher)));
  const records = {};
  const rcodes = {};
  const failed = [];
  results.forEach((r, i) => {
    const type = RECORD_TYPES[i];
    if (r.status === "fulfilled") {
      records[type] = r.value.records;
      rcodes[type] = r.value.rcode;
    } else {
      failed.push({ type, error: String(r.reason?.message ?? r.reason) });
    }
  });
  const data = { name, records, rcodes, failed_types: failed.map((f) => f.type) };
  if (failed.length === RECORD_TYPES.length) return indeterminate("dns", sourceUrl, "all record-type queries failed", data);
  if (failed.length > 0) return indeterminate("dns", sourceUrl, `partial: ${failed.map((f) => `${f.type} (${f.error})`).join(", ")}`, data);
  return ok("dns", sourceUrl, data);
}

export function reverseName(ip) {
  if (ip.includes(".")) return ip.split(".").reverse().join(".") + ".in-addr.arpa";
  const expanded = expandIPv6(ip);
  return expanded.replace(/:/g, "").split("").reverse().join(".") + ".ip6.arpa";
}

export function expandIPv6(ip) {
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const missing = 8 - h.length - t.length;
  const groups = [...h, ...Array(Math.max(0, missing)).fill("0"), ...t];
  return groups.map((g) => g.padStart(4, "0")).join(":");
}

export async function ptrSensor(ip, fetcher = fetchWithTimeout) {
  const name = reverseName(ip);
  const sourceUrl = dohUrl(name, "PTR");
  try {
    const { rcode, records } = await queryType(name, "PTR", fetcher);
    return ok("ptr", sourceUrl, { ip, query: name, rcode, hostnames: records.map((r) => stripDot(r.value)) });
  } catch (e) {
    return indeterminate("ptr", sourceUrl, e.message);
  }
}
