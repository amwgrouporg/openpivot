// Brave Web Search. Requires BRAVE_API_KEY; without it the route is indeterminate.
import { ok, indeterminate, fetchWithTimeout } from "../envelope.js";

export function braveUrl(q, count = 10) {
  const params = new URLSearchParams({ q, count: String(count), text_decorations: "false", safesearch: "off" });
  return `https://api.search.brave.com/res/v1/web/search?${params}`;
}

export function normalizeBrave(body, q) {
  const results = Array.isArray(body?.web?.results) ? body.web.results : [];
  return {
    query: q,
    result_count: results.length,
    results: results.map((r) => ({
      title: r.title ?? null,
      url: r.url ?? null,
      description: typeof r.description === "string" ? r.description.slice(0, 500) : null,
      age: r.age ?? r.page_age ?? null,
      language: r.language ?? null,
    })),
  };
}

export async function searchSensor(q, apiKey, count, fetcher = fetchWithTimeout) {
  const sourceUrl = `https://search.brave.com/search?q=${encodeURIComponent(q)}`;
  if (!apiKey) return indeterminate("search", sourceUrl, "BRAVE_API_KEY not configured");
  let res;
  try {
    res = await fetcher(braveUrl(q, count), { headers: { accept: "application/json", "x-subscription-token": apiKey } }, 12000);
  } catch (e) {
    return indeterminate("search", sourceUrl, e.message);
  }
  if (res.status === 429) return indeterminate("search", sourceUrl, "brave rate limit (429)");
  if (!res.ok) return indeterminate("search", sourceUrl, `http ${res.status}`);
  let body;
  try {
    body = await res.json();
  } catch (e) {
    return indeterminate("search", sourceUrl, `parse: ${e.message}`);
  }
  return ok("search", sourceUrl, normalizeBrave(body, q));
}
