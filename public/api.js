// Same-origin sensor calls. A network failure here is an indeterminate envelope,
// never a missing result.
export async function sensor(route, params = {}, { method = "GET", body } = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const url = `/api/${route}${qs.toString() ? `?${qs}` : ""}`;
  try {
    const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const env = await res.json();
    if (env && typeof env.status === "string") return env;
    return synthetic(route, url, `unexpected response shape (http ${res.status})`);
  } catch (e) {
    return synthetic(route, url, `network: ${e.message}`);
  }
}

function synthetic(sensorName, url, error) {
  return { ok: false, sensor: sensorName, source_url: null, fetched_at: new Date().toISOString(), status: "indeterminate", data: null, error, untrusted: true, note: "Client-side failure envelope." };
}
