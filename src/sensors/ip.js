// ipinfo.io: network ownership and geography for an IP.
import { ok, indeterminate, fetchWithTimeout } from "../envelope.js";

export function ipinfoUrl(ip) {
  return `https://ipinfo.io/${encodeURIComponent(ip)}/json`;
}

export function normalizeIpinfo(body, ip) {
  const org = typeof body?.org === "string" ? body.org : null;
  const m = org ? org.match(/^(AS\d+)\s+(.*)$/) : null;
  return {
    ip: body?.ip ?? ip,
    hostname: body?.hostname ?? null,
    asn: m ? m[1] : (body?.asn?.asn ?? null),
    org: m ? m[2] : (org ?? body?.asn?.name ?? null),
    city: body?.city ?? null,
    region: body?.region ?? null,
    country: body?.country ?? null,
    loc: body?.loc ?? null,
    anycast: Boolean(body?.anycast),
    bogon: Boolean(body?.bogon),
  };
}

export async function ipSensor(ip, token, fetcher = fetchWithTimeout) {
  const sourceUrl = ipinfoUrl(ip);
  const url = token ? `${sourceUrl}?token=${encodeURIComponent(token)}` : sourceUrl;
  let res;
  try {
    res = await fetcher(url, { headers: { accept: "application/json" } }, 10000);
  } catch (e) {
    return indeterminate("ip", sourceUrl, e.message);
  }
  if (res.status === 429 || res.status === 403) return indeterminate("ip", sourceUrl, `ipinfo ${res.status}${token ? "" : " (no IPINFO_TOKEN configured)"}`);
  if (!res.ok) return indeterminate("ip", sourceUrl, `http ${res.status}`);
  let body;
  try {
    body = await res.json();
  } catch (e) {
    return indeterminate("ip", sourceUrl, `parse: ${e.message}`);
  }
  return ok("ip", sourceUrl, normalizeIpinfo(body, ip));
}
