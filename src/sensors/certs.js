// Certificate transparency history. crt.sh first (apex + subdomains), Cert Spotter's
// keyless issuance API as the fallback when crt.sh is down, which is often.
import { ok, indeterminate, fetchWithTimeout } from "../envelope.js";

export function certspotterUrl(domain) {
  return `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names&expand=issuer`;
}

// Pure. Cert Spotter issuances -> crt.sh-shaped rows so one normaliser serves both.
export function certspotterToRows(list) {
  return (Array.isArray(list) ? list : []).map((c) => ({
    id: c.id,
    issuer_name: c.issuer?.name ?? c.issuer?.friendly_name ?? null,
    common_name: Array.isArray(c.dns_names) ? c.dns_names[0] : null,
    name_value: Array.isArray(c.dns_names) ? c.dns_names.join("\n") : "",
    not_before: c.not_before ?? null,
    not_after: c.not_after ?? null,
    cert_sha256: c.cert_sha256 ?? null,
  }));
}

export function crtshUrl(pattern) {
  return `https://crt.sh/?q=${encodeURIComponent(pattern)}&output=json`;
}

async function fetchList(pattern, fetcher) {
  const res = await fetcher(crtshUrl(pattern), { headers: { accept: "application/json" } }, 25000);
  if (!res.ok) throw new Error(`crt.sh http ${res.status}`);
  const text = await res.text();
  if (!text.trim()) return [];
  return JSON.parse(text);
}

// Pure. Turns crt.sh rows into a compact summary.
export function normalizeCerts(rows, domain) {
  const names = new Set();
  const issuers = new Map();
  let first = null;
  let last = null;
  const byId = new Map();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    byId.set(r.id, r);
    for (const n of String(r.name_value ?? "").split(/\n+/)) {
      const v = n.trim().toLowerCase().replace(/^\*\./, "");
      if (v) names.add(v);
    }
    if (r.issuer_name) issuers.set(r.issuer_name, (issuers.get(r.issuer_name) ?? 0) + 1);
    const nb = r.not_before ? String(r.not_before) : null;
    if (nb) {
      if (!first || nb < first) first = nb;
      if (!last || nb > last) last = nb;
    }
  }
  const recent = [...byId.values()]
    .sort((a, b) => String(b.not_before).localeCompare(String(a.not_before)))
    .slice(0, 10)
    .map((r) => ({ id: r.id, not_before: r.not_before, not_after: r.not_after, common_name: r.common_name, issuer: r.issuer_name, url: r.cert_sha256 ? `https://crt.sh/?sha256=${r.cert_sha256}` : `https://crt.sh/?id=${r.id}` }));
  const sortedNames = [...names].sort();
  return {
    domain,
    certificate_count: byId.size,
    distinct_names: sortedNames.slice(0, 200),
    distinct_names_truncated: sortedNames.length > 200,
    first_seen: first,
    last_seen: last,
    issuers: [...issuers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
    recent,
  };
}

export async function certsSensor(domain, fetcher = fetchWithTimeout) {
  const sourceUrl = crtshUrl(`%.${domain}`);
  const results = await Promise.allSettled([fetchList(domain, fetcher), fetchList(`%.${domain}`, fetcher)]);
  const rows = [];
  const errors = [];
  for (const r of results) {
    if (r.status === "fulfilled") rows.push(...r.value);
    else errors.push(String(r.reason?.message ?? r.reason));
  }
  if (errors.length < results.length) {
    const data = { ...normalizeCerts(rows, domain), provider: "crt.sh" };
    if (errors.length > 0) return indeterminate("certs", sourceUrl, `partial: ${errors.join("; ")}`, data);
    return ok("certs", sourceUrl, data);
  }
  // crt.sh failed outright: Cert Spotter.
  const csUrl = certspotterUrl(domain);
  try {
    const res = await fetcher(csUrl, { headers: { accept: "application/json" } }, 20000);
    if (res.status === 429) errors.push("certspotter rate limit (429)");
    else if (!res.ok) errors.push(`certspotter http ${res.status}`);
    else {
      const rows2 = certspotterToRows(await res.json());
      const data = { ...normalizeCerts(rows2, domain), provider: "certspotter", note: "crt.sh was unavailable; Cert Spotter covers unexpired and recently expired certificates only." };
      return ok("certs", csUrl, data);
    }
  } catch (e) {
    errors.push(`certspotter: ${e.message}`);
  }
  return indeterminate("certs", sourceUrl, errors.join("; "));
}
