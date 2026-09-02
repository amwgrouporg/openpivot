import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswer, reverseName, expandIPv6, dnsSensor } from "../src/sensors/dns.js";
import { normalizeDomain, normalizeIp as normalizeRdapIp, rdapSensor, parseBootstrap, registryBaseFor } from "../src/sensors/rdap.js";
import { normalizeCerts, certsSensor } from "../src/sensors/certs.js";
import { archiveNowSensor, normalizeCdx, waybackSensor } from "../src/sensors/wayback.js";
import { normalizeUrlscan } from "../src/sensors/urlscan.js";
import { normalizeIpinfo } from "../src/sensors/ip.js";
import { normalizeBrave, searchSensor } from "../src/sensors/search.js";
import { normalizeWikidata } from "../src/sensors/wikidata.js";
import { collapseWhitespace } from "../src/sensors/extract.js";

const jsonRes = (body, status = 200, url = "https://upstream/") => ({ ok: status >= 200 && status < 300, status, url, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) });
const failing = async () => { throw new Error("socket hang up"); };

test("dns normaliser handles MX, TXT and NXDOMAIN", () => {
  const mx = normalizeAnswer("MX", { Status: 0, Answer: [{ data: "10 mail.example.com.", TTL: 300 }] });
  assert.deepEqual(mx.records, [{ preference: 10, exchange: "mail.example.com", ttl: 300 }]);
  const txt = normalizeAnswer("TXT", { Status: 0, Answer: [{ data: "\"v=spf1 -all\"", TTL: 1 }] });
  assert.equal(txt.records[0].value, "v=spf1 -all");
  const nx = normalizeAnswer("A", { Status: 3 });
  assert.equal(nx.rcode, "NXDOMAIN");
  assert.deepEqual(nx.records, []);
});

test("dns sensor: transport failure is indeterminate, never empty-ok", async () => {
  const e = await dnsSensor("example.com", failing);
  assert.equal(e.status, "indeterminate");
  assert.deepEqual(e.data.records, {});
  assert.equal(e.data.failed_types.length, 6);
});

test("dns sensor: partial failure is indeterminate with partial data", async () => {
  let n = 0;
  const flaky = async (url) => { n++; if (url.includes("type=MX")) throw new Error("timeout"); return jsonRes({ Status: 0, Answer: [{ data: "1.2.3.4", TTL: 1 }] }); };
  const e = await dnsSensor("example.com", flaky);
  assert.equal(e.status, "indeterminate");
  assert.deepEqual(e.data.failed_types, ["MX"]);
  assert.equal(e.data.records.A[0].value, "1.2.3.4");
});

test("reverse names for PTR", () => {
  assert.equal(reverseName("8.8.4.4"), "4.4.8.8.in-addr.arpa");
  assert.equal(expandIPv6("2001:db8::1"), "2001:0db8:0000:0000:0000:0000:0000:0001");
  assert.ok(reverseName("2001:db8::1").endsWith(".ip6.arpa"));
  assert.equal(reverseName("2001:db8::1").length, 63 + 9);
});

test("rdap domain normaliser pulls registrar and events", () => {
  const body = {
    ldhName: "EXAMPLE.COM", handle: "H1", status: ["client transfer prohibited"],
    events: [{ eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" }],
    nameservers: [{ ldhName: "A.IANA-SERVERS.NET" }],
    secureDNS: { delegationSigned: true },
    entities: [{ handle: "R1", roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "RESERVED-Internet Assigned Numbers Authority"]]] }],
  };
  const d = normalizeDomain(body);
  assert.equal(d.registrar.name, "RESERVED-Internet Assigned Numbers Authority");
  assert.deepEqual(d.nameservers, ["a.iana-servers.net"]);
  assert.equal(d.dnssec_signed, true);
  assert.equal(d.events[0].action, "registration");
});

test("rdap ip normaliser builds cidrs", () => {
  const d = normalizeRdapIp({ handle: "NET-8", name: "GOGL", cidr0_cidrs: [{ v4prefix: "8.8.8.0", length: 24 }], country: "US", entities: [] });
  assert.deepEqual(d.cidrs, ["8.8.8.0/24"]);
});

test("rdap 404 from the redirector is indeterminate; from a registry it is a definitive negative", async () => {
  const boot = { services: [[["com"], ["https://rdap.verisign.com/com/v1/"]]] };
  const fromRedirector = async (url) => url.includes("data.iana.org") ? jsonRes(boot) : jsonRes({}, 404, "https://rdap.org/domain/x.zz");
  assert.equal((await rdapSensor("domain", "x.zz", fromRedirector)).status, "indeterminate");
  const fromRegistry = async (url) => url.includes("data.iana.org") ? jsonRes(boot) : jsonRes({}, 404, "https://rdap.verisign.com/com/v1/domain/x.com");
  const e = await rdapSensor("domain", "x.com", fromRegistry);
  assert.equal(e.status, "ok");
  assert.equal(e.data.registered, false);
});

test("rdap: bootstrap resolves the registry and rdap.org is only a fallback", async () => {
  const calls = [];
  const boot = { services: [[["com", "net"], ["https://rdap.verisign.com/com/v1/"]], [["co.uk"], ["https://rdap.nominet.uk/uk/"]]] };
  const map = parseBootstrap(boot);
  assert.equal(registryBaseFor("a.b.example.co.uk", map), "https://rdap.nominet.uk/uk/");
  assert.equal(registryBaseFor("example.net", map), "https://rdap.verisign.com/com/v1/");
  assert.equal(registryBaseFor("example.zz", map), null);
  const f = async (url) => { calls.push(url); if (url.includes("data.iana.org")) return jsonRes(boot); if (url.includes("verisign")) return jsonRes({ ldhName: "EXAMPLE.COM", events: [], entities: [] }, 200, url); throw new Error("should not reach rdap.org"); };
  const e = await rdapSensor("domain", "example.com", f);
  assert.equal(e.status, "ok");
  assert.ok(e.source_url.startsWith("https://rdap.verisign.com/"));
  assert.ok(!calls.some((u) => u.startsWith("https://rdap.org/")));
});

test("rdap: every candidate failing is indeterminate with all errors listed", async () => {
  const e = await rdapSensor("ip", "8.8.8.8", failing);
  assert.equal(e.status, "indeterminate");
  assert.match(e.error, /rdap\.org.*socket hang up.*arin/s);
});

test("certs normaliser dedupes names and finds first/last", () => {
  const rows = [
    { id: 1, issuer_name: "C=US, O=Let's Encrypt", common_name: "example.com", name_value: "example.com\n*.example.com", not_before: "2020-01-01T00:00:00", not_after: "2020-04-01T00:00:00" },
    { id: 2, issuer_name: "C=US, O=Let's Encrypt", common_name: "www.example.com", name_value: "www.example.com", not_before: "2024-06-01T00:00:00", not_after: "2024-09-01T00:00:00" },
    { id: 1, issuer_name: "C=US, O=Let's Encrypt", common_name: "example.com", name_value: "example.com", not_before: "2020-01-01T00:00:00", not_after: "2020-04-01T00:00:00" },
  ];
  const d = normalizeCerts(rows, "example.com");
  assert.equal(d.certificate_count, 2);
  assert.deepEqual(d.distinct_names, ["example.com", "www.example.com"]);
  assert.equal(d.first_seen, "2020-01-01T00:00:00");
  assert.equal(d.last_seen, "2024-06-01T00:00:00");
  assert.equal(d.recent[0].id, 2);
});

test("certs sensor: both queries failing is indeterminate", async () => {
  const e = await certsSensor("example.com", failing);
  assert.equal(e.status, "indeterminate");
  assert.equal(e.data, null);
});

test("wayback normaliser handles header row and empty index", () => {
  const rows = [["timestamp", "original", "statuscode", "mimetype"], ["20100101000000", "http://example.com/", "200", "text/html"], ["20240101000000", "https://example.com/", "200", "text/html"]];
  const d = normalizeCdx(rows, "example.com");
  assert.equal(d.captures_in_index, 2);
  assert.equal(d.first_seen, "20100101000000");
  assert.equal(d.sample[1].archived_url, "https://web.archive.org/web/20240101000000/https://example.com/");
  assert.equal(normalizeCdx([], "x.com").captures_in_index, 0);
});

test("wayback sensor: http 503 is indeterminate", async () => {
  const e = await waybackSensor("example.com", async () => jsonRes([], 503));
  assert.equal(e.status, "indeterminate");
});

test("archive submission uses a browser-safe timeout budget", async () => {
  let observedTimeout;
  const response = { status: 202, headers: { get: () => null } };
  const result = await archiveNowSensor("https://example.com/page", async (_url, _options, timeout) => {
    observedTimeout = timeout;
    return response;
  });

  assert.equal(observedTimeout, 18000);
  assert.equal(result.status, "indeterminate");
  assert.equal(result.data.submitted, true);
});

test("urlscan, ipinfo, brave, wikidata normalisers", () => {
  const u = normalizeUrlscan({ total: 1, results: [{ _id: "abc", task: { time: "t", url: "https://example.com/" }, page: { ip: "1.1.1.1", asn: "AS13335", asnname: "CF", server: "cloudflare" } }] }, "example.com");
  assert.equal(u.scans[0].report_url, "https://urlscan.io/result/abc/");
  const i = normalizeIpinfo({ ip: "8.8.8.8", org: "AS15169 Google LLC", country: "US" }, "8.8.8.8");
  assert.equal(i.asn, "AS15169");
  assert.equal(i.org, "Google LLC");
  const b = normalizeBrave({ web: { results: [{ title: "T", url: "https://x", description: "d".repeat(600) }] } }, "q");
  assert.equal(b.results[0].description.length, 500);
  const w = normalizeWikidata({ search: [{ id: "Q42", label: "Douglas Adams", description: "writer" }] }, "adams");
  assert.equal(w.results[0].url, "https://www.wikidata.org/wiki/Q42");
});

test("search without a key is indeterminate, not empty", async () => {
  const e = await searchSensor("x", undefined, 10, failing);
  assert.equal(e.status, "indeterminate");
  assert.match(e.error, /BRAVE_API_KEY/);
});

test("collapseWhitespace", () => {
  assert.equal(collapseWhitespace("  a \n\n\n b\t\tc  "), "a\n\nb c");
});

test("certs: crt.sh down falls back to Cert Spotter and says so", async () => {
  const f = async (url) => { if (url.includes("crt.sh")) return jsonRes({}, 502); return jsonRes([{ id: "1", dns_names: ["example.com", "www.example.com"], issuer: { name: "C=US, O=Test CA" }, not_before: "2025-01-01T00:00:00Z", not_after: "2025-04-01T00:00:00Z", cert_sha256: "ab" }]); };
  const e = await certsSensor("example.com", f);
  assert.equal(e.status, "ok");
  assert.equal(e.data.provider, "certspotter");
  assert.deepEqual(e.data.distinct_names, ["example.com", "www.example.com"]);
  assert.match(e.data.recent[0].url, /sha256=ab/);
});

test("certs: crt.sh and Cert Spotter both down is indeterminate", async () => {
  const e = await certsSensor("example.com", async () => jsonRes({}, 503));
  assert.equal(e.status, "indeterminate");
  assert.match(e.error, /crt\.sh http 503.*certspotter http 503/);
});

test("wayback: cdx down falls back to the availability API", async () => {
  const f = async (url) => { if (url.includes("/cdx/")) throw new Error("Network connection lost."); if (url.includes("timestamp=1996")) return jsonRes({ archived_snapshots: { closest: { available: true, status: "200", timestamp: "20020601000000", url: "http://web.archive.org/web/20020601000000/http://example.com/" } } }); return jsonRes({ archived_snapshots: { closest: { available: true, status: "200", timestamp: "20260902040541", url: "http://web.archive.org/web/20260902040541/https://example.com/" } } }); };
  const e = await waybackSensor("example.com", f);
  assert.equal(e.status, "ok");
  assert.equal(e.data.precision, "closest-snapshot");
  assert.equal(e.data.first_seen, "20020601000000");
  assert.equal(e.data.sample[0].archived_url, "https://web.archive.org/web/20020601000000/http://example.com/");
});

test("wayback: everything down is indeterminate with both errors", async () => {
  const e = await waybackSensor("example.com", failing);
  assert.equal(e.status, "indeterminate");
  assert.match(e.error, /cdx.*availability/);
});

test("dns: null MX per RFC 7505 is explicit, not an empty exchange", () => {
  const mx = normalizeAnswer("MX", { Status: 0, Answer: [{ data: "0 .", TTL: 1 }] });
  assert.equal(mx.records[0].null_mx, true);
  assert.equal(mx.records[0].exchange, null);
});
