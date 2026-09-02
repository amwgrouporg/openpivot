// urlscan.io search: recent public scans that touched a domain.
import { ok, indeterminate, fetchWithTimeout } from "../envelope.js";

export function urlscanSearchUrl(domain, size = 20) {
  return `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`domain:${domain}`)}&size=${size}`;
}

export function normalizeUrlscan(body, domain) {
  const results = Array.isArray(body?.results) ? body.results : [];
  return {
    domain,
    total: typeof body?.total === "number" ? body.total : results.length,
    has_more: Boolean(body?.has_more),
    scans: results.map((r) => ({
      time: r.task?.time ?? null,
      url: r.task?.url ?? r.page?.url ?? null,
      ip: r.page?.ip ?? null,
      asn: r.page?.asn ?? null,
      asn_name: r.page?.asnname ?? null,
      server: r.page?.server ?? null,
      title: r.page?.title ?? null,
      country: r.page?.country ?? null,
      report_url: r._id ? `https://urlscan.io/result/${r._id}/` : null,
    })),
  };
}

export async function urlscanSensor(domain, apiKey, fetcher = fetchWithTimeout) {
  const sourceUrl = urlscanSearchUrl(domain);
  const headers = { accept: "application/json" };
  if (apiKey) headers["api-key"] = apiKey;
  let res;
  try {
    res = await fetcher(sourceUrl, { headers }, 15000);
  } catch (e) {
    return indeterminate("urlscan", sourceUrl, e.message);
  }
  if (res.status === 429) return indeterminate("urlscan", sourceUrl, "urlscan rate limit (429)");
  if (!res.ok) return indeterminate("urlscan", sourceUrl, `http ${res.status}`);
  let body;
  try {
    body = await res.json();
  } catch (e) {
    return indeterminate("urlscan", sourceUrl, `parse: ${e.message}`);
  }
  return ok("urlscan", sourceUrl, normalizeUrlscan(body, domain));
}
