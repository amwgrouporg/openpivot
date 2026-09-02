// Wayback Machine: CDX index timeline for a URL, and best-effort archive-now.
import { ok, indeterminate, fetchWithTimeout } from "../envelope.js";

export function cdxUrl(target, limit = 1000) {
  const params = new URLSearchParams({
    url: target,
    output: "json",
    fl: "timestamp,original,statuscode,mimetype",
    filter: "statuscode:200",
    collapse: "timestamp:6",
    limit: String(limit),
  });
  return `https://web.archive.org/cdx/search/cdx?${params}`;
}

export function archivedUrl(timestamp, original) {
  return `https://web.archive.org/web/${timestamp}/${original}`;
}

// Pure. CDX JSON output: first row is the header.
export function normalizeCdx(rows, target) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { target, captures_in_index: 0, first_seen: null, last_seen: null, precision: "month", sample: [] };
  }
  const [header, ...body] = rows;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const entries = body
    .filter((r) => Array.isArray(r) && r[idx.timestamp])
    .map((r) => ({
      timestamp: r[idx.timestamp],
      original: r[idx.original],
      status: r[idx.statuscode],
      mimetype: r[idx.mimetype],
      archived_url: archivedUrl(r[idx.timestamp], r[idx.original]),
    }));
  const sample = entries.length <= 24 ? entries : [...entries.slice(0, 12), ...entries.slice(-12)];
  return {
    target,
    captures_in_index: entries.length,
    first_seen: entries[0]?.timestamp ?? null,
    last_seen: entries.at(-1)?.timestamp ?? null,
    precision: "month",
    note: "One capture per month with HTTP 200, up to the query limit. Not every capture.",
    sample,
  };
}

export function availableUrl(target, timestamp) {
  return `https://archive.org/wayback/available?url=${encodeURIComponent(target)}${timestamp ? `&timestamp=${timestamp}` : ""}`;
}

// Pure. Two availability answers (closest to 1996, closest to now) -> timeline shape.
export function isAvailabilityShape(body) {
  return Boolean(body) && typeof body === "object" && body.archived_snapshots !== undefined && typeof body.archived_snapshots === "object";
}

export function normalizeAvailability(earliest, latest, target) {
  const pick = (b) => b?.archived_snapshots?.closest;
  const e = pick(earliest);
  const l = pick(latest);
  const sample = [];
  for (const s of [e, l]) if (s?.available && s.timestamp && !sample.some((x) => x.timestamp === s.timestamp)) sample.push({ timestamp: s.timestamp, original: target, status: s.status, mimetype: null, archived_url: s.url?.replace(/^http:/, "https:") ?? archivedUrl(s.timestamp, target) });
  return {
    target,
    captures_in_index: sample.length ? null : 0,
    first_seen: e?.available ? e.timestamp : null,
    last_seen: l?.available ? l.timestamp : null,
    precision: "closest-snapshot",
    note: "CDX index unavailable; these are the snapshots closest to 1996 and to now from the availability API. Capture counts unknown.",
    sample,
  };
}

export async function waybackSensor(target, fetcher = fetchWithTimeout) {
  const sourceUrl = cdxUrl(target);
  const errors = [];
  try {
    const res = await fetcher(sourceUrl, { headers: { accept: "application/json" } }, 20000);
    if (!res.ok) errors.push(`cdx http ${res.status}`);
    else {
      const text = await res.text();
      const rows = text.trim() ? JSON.parse(text) : [];
      // CDX answers "no captures" with an empty body, which is indistinguishable from a
      // broken upstream. Only a header row is proof of a working index.
      if (Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])) return ok("wayback", sourceUrl, normalizeCdx(rows, target));
      errors.push("cdx returned no rows; confirming through the availability API");
    }
  } catch (e) {
    errors.push(`cdx: ${e.message}`);
  }
  // CDX failed: availability API on archive.org, a different host that often stays up.
  const eUrl = availableUrl(target, "19960101000000");
  try {
    const [er, lr] = await Promise.all([fetcher(eUrl, {}, 15000), fetcher(availableUrl(target), {}, 15000)]);
    if (!er.ok || !lr.ok) errors.push(`availability http ${er.status}/${lr.status}`);
    else {
      const [eb, lb] = await Promise.all([er.json(), lr.json()]);
      if (isAvailabilityShape(eb) && isAvailabilityShape(lb)) return ok("wayback", eUrl, normalizeAvailability(eb, lb, target));
      errors.push("availability returned a body without archived_snapshots");
    }
  } catch (e) {
    errors.push(`availability: ${e.message}`);
  }
  return indeterminate("wayback", sourceUrl, errors.join("; "));
}

export async function archiveNowSensor(target, fetcher = fetchWithTimeout) {
  const sourceUrl = `https://web.archive.org/save/${target}`;
  const checkUrl = `https://web.archive.org/web/*/${target}`;
  let res;
  try {
    res = await fetcher(sourceUrl, { method: "GET", redirect: "manual", headers: { "user-agent": UA } }, 18000);
  } catch (e) {
    return indeterminate("archive", sourceUrl, `${e.message}; the request may still complete, check ${checkUrl}`, { submitted: true, check_url: checkUrl });
  }
  const loc = res.headers.get("content-location") || res.headers.get("location");
  if (loc && /\/web\/\d{4,14}/.test(loc)) {
    const archived = loc.startsWith("http") ? loc : `https://web.archive.org${loc}`;
    return ok("archive", sourceUrl, { submitted: true, archived_url: archived, http_status: res.status, check_url: checkUrl });
  }
  return indeterminate("archive", sourceUrl, `no archive location in response (http ${res.status}); check ${checkUrl}`, { submitted: true, check_url: checkUrl, http_status: res.status });
}

export const UA = "Mozilla/5.0 (compatible; OpenPivot/0.1; +https://github.com/amwgrouporg/openpivot)";
