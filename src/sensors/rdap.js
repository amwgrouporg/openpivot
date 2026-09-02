// RDAP for domains and IPs.
// Domains: IANA bootstrap (data.iana.org/rdap/dns.json) resolves the TLD to its registry
// RDAP base, then the registry is queried directly. rdap.org is the fallback.
// IPs: rdap.org redirector first, ARIN's RDAP (which redirects to the owning RIR) as fallback.
import { ok, indeterminate, fetchWithTimeout } from "../envelope.js";

const UA = "Mozilla/5.0 (compatible; OpenPivot/0.1; +https://github.com/amwgrouporg/openpivot)";
const HEADERS = { accept: "application/rdap+json, application/json", "user-agent": UA };
const IANA_DNS = "https://data.iana.org/rdap/dns.json";
let bootstrapCache = null; // { fetched_at, map: Map<tld, base> }

export function rdapUrl(kind, q) {
  return `https://rdap.org/${kind}/${encodeURIComponent(q)}`;
}

// Pure. IANA bootstrap JSON -> Map of tld -> first https base URL.
export function parseBootstrap(body) {
  const map = new Map();
  for (const [tlds, urls] of body?.services ?? []) {
    const base = (urls ?? []).find((u) => u.startsWith("https://")) ?? urls?.[0];
    if (!base) continue;
    for (const tld of tlds) map.set(String(tld).toLowerCase(), base.endsWith("/") ? base : `${base}/`);
  }
  return map;
}

export function registryBaseFor(name, map) {
  const labels = name.split(".");
  // Longest matching suffix wins (some entries are multi-label).
  for (let i = 1; i < labels.length; i++) {
    const suffix = labels.slice(i).join(".");
    if (map.has(suffix)) return map.get(suffix);
  }
  return null;
}

async function bootstrap(fetcher) {
  if (bootstrapCache && Date.now() - bootstrapCache.fetched_at < 6 * 3600 * 1000) return bootstrapCache.map;
  const res = await fetcher(IANA_DNS, { headers: HEADERS }, 10000);
  if (!res.ok) throw new Error(`iana bootstrap http ${res.status}`);
  const map = parseBootstrap(await res.json());
  bootstrapCache = { fetched_at: Date.now(), map };
  return map;
}

async function attempt(url, fetcher) {
  const res = await fetcher(url, { headers: HEADERS, redirect: "follow" }, 15000);
  return { res, finalUrl: res.url || url };
}

export async function rdapSensor(kind, q, fetcher = fetchWithTimeout) {
  const candidates = [];
  if (kind === "domain") {
    try {
      const base = registryBaseFor(q, await bootstrap(fetcher));
      if (base) candidates.push(`${base}domain/${encodeURIComponent(q)}`);
    } catch (e) {
      candidates.push(`bootstrap-failed:${e.message}`);
    }
    candidates.push(rdapUrl("domain", q));
  } else {
    candidates.push(rdapUrl("ip", q), `https://rdap.arin.net/registry/ip/${encodeURIComponent(q)}`);
  }

  const errors = [];
  for (const url of candidates) {
    if (url.startsWith("bootstrap-failed:")) { errors.push(url); continue; }
    let res;
    let finalUrl;
    try {
      ({ res, finalUrl } = await attempt(url, fetcher));
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
      continue;
    }
    const servedByRedirector = finalUrl.startsWith("https://rdap.org/");
    if (res.status === 404) {
      // A registry 404 is a definitive "not registered". A redirector 404 means no RDAP
      // service is known for this name, which is not evidence of anything.
      if (!servedByRedirector) return ok("rdap", finalUrl, { kind, query: q, registered: false });
      errors.push(`${url}: rdap.org has no RDAP service for this name`);
      continue;
    }
    if (!res.ok) { errors.push(`${url}: http ${res.status}`); continue; }
    let body;
    try {
      body = await res.json();
    } catch (e) {
      errors.push(`${url}: parse ${e.message}`);
      continue;
    }
    return ok("rdap", finalUrl, kind === "domain" ? normalizeDomain(body) : normalizeIp(body));
  }
  return indeterminate("rdap", candidates.find((u) => u.startsWith("http")) ?? null, errors.join("; "));
}

function vcardField(entity, key) {
  const arr = entity?.vcardArray?.[1];
  if (!Array.isArray(arr)) return null;
  const hit = arr.find((f) => Array.isArray(f) && f[0] === key);
  return hit ? (Array.isArray(hit[3]) ? hit[3].join(" ") : hit[3]) : null;
}

function entities(body) {
  const out = [];
  const walk = (list, depth) => {
    if (!Array.isArray(list) || depth > 3) return;
    for (const e of list) {
      out.push({
        handle: e.handle ?? null,
        roles: Array.isArray(e.roles) ? e.roles : [],
        name: vcardField(e, "fn"),
        org: vcardField(e, "org"),
        email: vcardField(e, "email"),
      });
      walk(e.entities, depth + 1);
    }
  };
  walk(body.entities, 0);
  return out.slice(0, 20);
}

export function normalizeDomain(body) {
  const ents = entities(body);
  const registrar = ents.find((e) => e.roles.includes("registrar"));
  return {
    kind: "domain",
    registered: true,
    ldh_name: body.ldhName ?? null,
    handle: body.handle ?? null,
    status: Array.isArray(body.status) ? body.status : [],
    events: Array.isArray(body.events) ? body.events.map((e) => ({ action: e.eventAction, date: e.eventDate })) : [],
    nameservers: Array.isArray(body.nameservers) ? body.nameservers.map((n) => (n.ldhName ?? "").toLowerCase()).filter(Boolean) : [],
    dnssec_signed: body.secureDNS?.delegationSigned ?? null,
    registrar: registrar ? { name: registrar.name ?? registrar.org, handle: registrar.handle } : null,
    entities: ents,
    port43: body.port43 ?? null,
  };
}

export function normalizeIp(body) {
  const ents = entities(body);
  return {
    kind: "ip",
    handle: body.handle ?? null,
    name: body.name ?? null,
    type: body.type ?? null,
    start_address: body.startAddress ?? null,
    end_address: body.endAddress ?? null,
    cidrs: Array.isArray(body.cidr0_cidrs) ? body.cidr0_cidrs.map((c) => `${c.v4prefix ?? c.v6prefix}/${c.length}`) : [],
    country: body.country ?? null,
    status: Array.isArray(body.status) ? body.status : [],
    events: Array.isArray(body.events) ? body.events.map((e) => ({ action: e.eventAction, date: e.eventDate })) : [],
    entities: ents,
    port43: body.port43 ?? null,
  };
}
