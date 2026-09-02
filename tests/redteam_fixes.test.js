// Regression tests for the 2026-09-02 red-team findings (docs/REDTEAM_gpt56sol_20260902.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIp, parseHttpUrl } from "../src/validate.js";
import { dnsSensor } from "../src/sensors/dns.js";
import { rdapSensor, looksLikeRdap } from "../src/sensors/rdap.js";
import { certsSensor, normalizeCerts } from "../src/sensors/certs.js";
import { waybackSensor, isAvailabilityShape } from "../src/sensors/wayback.js";
import { urlscanSensor } from "../src/sensors/urlscan.js";
import { ipSensor } from "../src/sensors/ip.js";
import { searchSensor } from "../src/sensors/search.js";
import { wikidataSensor } from "../src/sensors/wikidata.js";
import { fetchPublic, assertResolvesPublic } from "../src/sensors/extract.js";

const jsonRes = (body, status = 200, url = "https://upstream/", headers = {}) => ({ ok: status >= 200 && status < 300, status, url, headers: new Headers(headers), json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const boot = { services: [[["com"], ["https://rdap.verisign.com/com/v1/"]]] };
const dohPublic = (type) => jsonRes({ Status: 0, Answer: type === "A" ? [{ data: "93.184.216.34", TTL: 1 }] : [] });
const dohPrivate = (type) => jsonRes({ Status: 0, Answer: type === "A" ? [{ data: "10.0.0.5", TTL: 1 }] : [] });
const typeOf = (url) => new URL(url).searchParams.get("type");

test("#11 DoH 200 {} is indeterminate, not empty-ok", async () => {
  const e = await dnsSensor("example.com", async () => jsonRes({}));
  assert.equal(e.status, "indeterminate");
  assert.equal(e.data.failed_types.length, 6);
  assert.deepEqual(e.data.records, {});
});

test("#7 RDAP 200 {} from a registry is indeterminate, not registered", async () => {
  const f = async (url) => url.includes("data.iana.org") ? jsonRes(boot) : jsonRes({}, 200, url);
  const e = await rdapSensor("domain", "example.com", f);
  assert.equal(e.status, "indeterminate");
  assert.match(e.error, /not an RDAP domain object/);
  assert.equal(looksLikeRdap("domain", { objectClassName: "domain" }), true);
  assert.equal(looksLikeRdap("ip", { startAddress: "8.8.8.0" }), true);
  assert.equal(looksLikeRdap("ip", {}), false);
});

test("#8 crt.sh empty body is indeterminate; [] is a real zero", async () => {
  const empty = await certsSensor("example.com", async (url) => url.includes("crt.sh") ? jsonRes("", 200) : jsonRes({}, 503));
  assert.equal(empty.status, "indeterminate");
  assert.match(empty.error, /empty body/);
  const zero = await certsSensor("example.com", async (url) => url.includes("crt.sh") ? jsonRes([]) : jsonRes({}, 503));
  assert.equal(zero.status, "ok");
  assert.equal(zero.data.certificate_count, 0);
  const bad = await certsSensor("example.com", async (url) => url.includes("crt.sh") ? jsonRes({}, 502) : jsonRes({ not: "an array" }));
  assert.equal(bad.status, "indeterminate");
  assert.match(bad.error, /non-array/);
});

test("#20 issuer counts are computed after dedupe", () => {
  const row = { id: 1, issuer_name: "CA", common_name: "a", name_value: "a", not_before: "2020-01-01", not_after: "2020-02-01" };
  const d = normalizeCerts([row, { ...row }], "a");
  assert.equal(d.certificate_count, 1);
  assert.deepEqual(d.issuers, [{ name: "CA", count: 1 }]);
});

test("#9 empty CDX body goes to the availability API; a real empty index reads as zero", async () => {
  const f = async (url) => { if (url.includes("/cdx/")) return jsonRes("", 200); return jsonRes({ archived_snapshots: {} }); };
  const e = await waybackSensor("example.com", f);
  assert.equal(e.status, "ok");
  assert.equal(e.data.precision, "closest-snapshot");
  assert.equal(e.data.captures_in_index, 0);
  assert.equal(e.data.first_seen, null);
});

test("#10 availability 200 {} is indeterminate", async () => {
  const f = async (url) => { if (url.includes("/cdx/")) return jsonRes("", 200); return jsonRes({}); };
  const e = await waybackSensor("example.com", f);
  assert.equal(e.status, "indeterminate");
  assert.match(e.error, /without archived_snapshots/);
  assert.equal(isAvailabilityShape({ archived_snapshots: {} }), true);
  assert.equal(isAvailabilityShape({}), false);
});

test("#12 #13 provider 200 {} is indeterminate for urlscan, ipinfo, brave, wikidata", async () => {
  const empty = async () => jsonRes({});
  assert.equal((await urlscanSensor("example.com", "k", empty)).status, "indeterminate");
  assert.equal((await ipSensor("8.8.8.8", "k", empty)).status, "indeterminate");
  assert.equal((await searchSensor("q", "k", 5, empty)).status, "indeterminate");
  assert.equal((await wikidataSensor("q", empty)).status, "indeterminate");
  const brave = await searchSensor("q", "k", 5, async () => jsonRes({ type: "search", query: { original: "q" } }));
  assert.equal(brave.status, "ok");
  assert.equal(brave.data.result_count, 0);
});

test("#22 IPv4-mapped IPv6 normalises to the IPv4", () => {
  assert.equal(normalizeIp("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(normalizeIp("::FFFF:8.8.8.8"), "8.8.8.8");
});

test("#2 non-default ports are refused", () => {
  assert.equal(parseHttpUrl("https://example.com:8443/"), null);
  assert.equal(parseHttpUrl("http://example.com:8080/"), null);
  assert.ok(parseHttpUrl("http://example.com:80/"), "default port is not a port");
  assert.ok(parseHttpUrl("https://example.com/"));
});

test("#1 redirect to a private target is refused; redirect to a public target is followed with checks", async () => {
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    if (url.includes("dns-query")) return dohPublic(typeOf(url));
    if (url === "https://start.example/") return jsonRes("", 302, url, { location: "http://127.0.0.1/admin" });
    return jsonRes("<html><title>ok</title></html>", 200, url);
  };
  await assert.rejects(fetchPublic(parseHttpUrl("https://start.example/"), {}, f), /disallowed target/);
  const g = async (url) => {
    if (url.includes("dns-query")) return dohPublic(typeOf(url));
    if (url === "https://start.example/") return jsonRes("", 301, url, { location: "https://end.example/page" });
    return jsonRes("body", 200, url);
  };
  const { res, finalUrl } = await fetchPublic(parseHttpUrl("https://start.example/"), {}, g);
  assert.equal(res.status, 200);
  assert.equal(finalUrl, "https://end.example/page");
});

test("#1 hostnames resolving to private space are refused, and unresolvable ones too", async () => {
  await assert.rejects(assertResolvesPublic(parseHttpUrl("https://rebind.example/"), async (url) => url.includes("dns-query") ? dohPrivate(typeOf(url)) : jsonRes({})), /private address/);
  await assert.rejects(assertResolvesPublic(parseHttpUrl("https://nx.example/"), async () => jsonRes({ Status: 3 })), /no public address records/);
  await assert.rejects(assertResolvesPublic(parseHttpUrl("https://down.example/"), async () => { throw new Error("socket"); }), /could not resolve/);
  await assertResolvesPublic(parseHttpUrl("https://93.184.216.34/"), async () => { throw new Error("must not be called for literals"); });
  await assert.rejects(assertResolvesPublic(parseHttpUrl("https://[2606:4700::1]/"), async () => { throw new Error("x"); }).then(() => assertResolvesPublic({ hostname: "[fe80::1]" }, async () => {})), /private/);
});

test("#1 more than five redirects is refused", async () => {
  const f = async (url) => url.includes("dns-query") ? dohPublic(typeOf(url)) : jsonRes("", 302, url, { location: "https://loop.example/" + Math.random() });
  await assert.rejects(fetchPublic(parseHttpUrl("https://loop.example/"), {}, f), /redirects/);
});
