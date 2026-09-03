import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSensor } from "../src/sensors/extract.js";

// Answers the DoH preflight with a public address, then serves one HTML page.
function fakeFetcher(url) {
  if (url.startsWith("https://cloudflare-dns.com/")) {
    const type = new URL(url).searchParams.get("type");
    return new Response(JSON.stringify({ Status: 0, Answer: type === "A" ? [{ data: "93.184.216.34", TTL: 60 }] : [] }), { status: 200, headers: { "content-type": "application/dns-json" } });
  }
  return new Response("<html><body><p>x</p></body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

test("a parser fault inside the extract sensor is indeterminate with the sensor name and source URL", async () => {
  const saved = globalThis.HTMLRewriter;
  globalThis.HTMLRewriter = class { on() { return this; } transform() { throw new Error("Parser error: synthetic"); } };
  try {
    const envelope = await extractSensor(new URL("https://public.example/page"), fakeFetcher);
    assert.equal(envelope.status, "indeterminate");
    assert.equal(envelope.sensor, "extract");
    assert.equal(envelope.source_url, "https://public.example/page");
    assert.match(envelope.error, /parse: Parser error: synthetic/);
    assert.equal(envelope.data.http_status, 200);
  } finally {
    globalThis.HTMLRewriter = saved;
  }
});
