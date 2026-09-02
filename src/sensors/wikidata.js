// Wikidata entity search. Keyless.
import { ok, indeterminate, fetchWithTimeout } from "../envelope.js";

export function wikidataUrl(q, limit = 10) {
  const params = new URLSearchParams({ action: "wbsearchentities", search: q, language: "en", uselang: "en", format: "json", limit: String(limit), type: "item" });
  return `https://www.wikidata.org/w/api.php?${params}`;
}

export function normalizeWikidata(body, q) {
  const list = Array.isArray(body?.search) ? body.search : [];
  return {
    query: q,
    result_count: list.length,
    results: list.map((r) => ({
      id: r.id ?? null,
      label: r.label ?? null,
      description: r.description ?? null,
      aliases: Array.isArray(r.aliases) ? r.aliases.slice(0, 5) : [],
      url: r.id ? `https://www.wikidata.org/wiki/${r.id}` : null,
    })),
  };
}

export async function wikidataSensor(q, fetcher = fetchWithTimeout) {
  const sourceUrl = wikidataUrl(q);
  let res;
  try {
    res = await fetcher(sourceUrl, { headers: { accept: "application/json", "user-agent": "OpenPivot/0.1 (https://github.com/amwgrouporg/openpivot)" } }, 10000);
  } catch (e) {
    return indeterminate("wikidata", sourceUrl, e.message);
  }
  if (!res.ok) return indeterminate("wikidata", sourceUrl, `http ${res.status}`);
  let body;
  try {
    body = await res.json();
  } catch (e) {
    return indeterminate("wikidata", sourceUrl, `parse: ${e.message}`);
  }
  return ok("wikidata", sourceUrl, normalizeWikidata(body, q));
}
