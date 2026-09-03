import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHostname, normalizeIp, parseHttpUrl, isPrivateIPv4, isPrivateIPv6, isPrivateIp, ipv6Groups, clampInt, shortText } from "../src/validate.js";
import { candidatesFrom, newCase } from "../public/store.js";

test("hostnames normalise and reject junk", () => {
  assert.equal(normalizeHostname("Example.COM."), "example.com");
  assert.equal(normalizeHostname("*.example.com"), "example.com");
  assert.equal(normalizeHostname("xn--80ak6aa92e.com"), "xn--80ak6aa92e.com");
  assert.equal(normalizeHostname("1.2.3.4"), null);
  assert.equal(normalizeHostname("localhost"), null);
  assert.equal(normalizeHostname("bad_host.com"), null);
  assert.equal(normalizeHostname("a b.com"), null);
  assert.equal(normalizeHostname(""), null);
  assert.equal(normalizeHostname(null), null);
});

test("ips normalise and reject junk", () => {
  assert.equal(normalizeIp("8.8.8.8"), "8.8.8.8");
  assert.equal(normalizeIp("2606:4700::1111"), "2606:4700::1111");
  assert.equal(normalizeIp("999.1.1.1"), null);
  assert.equal(normalizeIp("example.com"), null);
  assert.equal(normalizeIp("8.8.8.8; rm -rf /"), null);
});

test("private ranges are recognised", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.5.5", "192.168.1.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) assert.equal(isPrivateIPv4(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1"]) assert.equal(isPrivateIPv4(ip), false, ip);
});

test("http urls parse and SSRF targets are refused", () => {
  assert.equal(parseHttpUrl("https://example.com/a?b=1").href, "https://example.com/a?b=1");
  assert.equal(parseHttpUrl("ftp://example.com/"), null);
  assert.equal(parseHttpUrl("http://localhost:8787/"), null);
  assert.equal(parseHttpUrl("http://127.0.0.1/"), null);
  assert.equal(parseHttpUrl("http://10.1.1.1/x"), null);
  assert.equal(parseHttpUrl("http://[::1]/"), null);
  assert.equal(parseHttpUrl("http://metadata.internal/"), null);
  assert.equal(parseHttpUrl("http://user:pw@example.com/"), null);
  assert.equal(parseHttpUrl("not a url"), null);
});

test("clampInt and shortText", () => {
  assert.equal(clampInt("50", 1, 20, 10), 20);
  assert.equal(clampInt("abc", 1, 20, 10), 10);
  assert.equal(shortText("  hi  ", 10), "hi");
  assert.equal(shortText("", 10), null);
  assert.equal(shortText("x".repeat(20), 5), "xxxxx");
});

test("candidate generation excludes selectors the board cannot add", () => {
  const caseData = newCase("Candidates");
  const entity = { id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" };
  caseData.entities.push(entity);
  const envelope = { sensor: "certs", data: { distinct_names: ["www.example.com", "user@example.com", "not a host"] } };

  assert.deepEqual(candidatesFrom(caseData, entity, envelope), [{ type: "domain", value: "www.example.com", why: "name on a certificate" }]);
});

test("IPv6 special-use ranges are refused by prefix bits, not string prefix", () => {
  const refused = [
    "fe80::1", "fe90::1", "febf::1",            // link-local fe80::/10, not just the "fe80" spelling
    "fec0::1",                                   // site-local fec0::/10
    "fc00::1", "fd12::1",                        // unique local fc00::/7
    "ff02::1",                                   // multicast ff00::/8
    "::1", "::", "0:0:0:0:0:0:0:1", "0000:0000:0000:0000:0000:0000:0000:0000",
    "::ffff:c0a8:101",                           // IPv4-mapped in hex form
    "2002:c0a8:101::1",                          // 6to4 embedding 192.168.1.1
    "64:ff9b::7f00:1",                           // NAT64 embedding 127.0.0.1
  ];
  for (const ip of refused) assert.equal(isPrivateIPv6(ip), true, ip);
  const allowed = ["2606:4700::1111", "2001:4860:4860::8888", "fe7f::1", "2002:808:808::1", "64:ff9b::808:808"];
  for (const ip of allowed) assert.equal(isPrivateIPv6(ip), false, ip);
  assert.equal(isPrivateIp("fe90::1"), true);
});

test("link-local and site-local IPv6 literals are refused as fetch targets", () => {
  assert.equal(parseHttpUrl("http://[fe90::1]/"), null);
  assert.equal(parseHttpUrl("http://[febf::1]/admin"), null);
  assert.equal(parseHttpUrl("http://[fec0::1]/"), null);
  assert.equal(parseHttpUrl("http://[2002:c0a8:101::1]/"), null);
  assert.equal(parseHttpUrl("http://[2606:4700::1111]/").href, "http://[2606:4700::1111]/");
});

test("unparseable IPv6 text is not proven public, so it is refused", () => {
  assert.equal(isPrivateIPv6("not-an-ip"), true);
  assert.equal(isPrivateIPv6("1:2:3:4:5:6:7:8:9"), true);
  assert.equal(isPrivateIPv6("1::2::3"), true);
});

test("an embedded dotted quad is valid only as the final group of the whole address", () => {
  assert.equal(ipv6Groups("1.2.3.4::"), null);
  assert.equal(ipv6Groups("1:2:1.2.3.4::"), null);
  assert.equal(isPrivateIPv6("1:2:1.2.3.4::"), true);
  assert.deepEqual(ipv6Groups("::ffff:1.2.3.4"), [0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  assert.deepEqual(ipv6Groups("1:2:3:4:5:6:1.2.3.4"), [1, 2, 3, 4, 5, 6, 0x0102, 0x0304]);
});
