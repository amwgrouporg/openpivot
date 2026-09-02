import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHostname, normalizeIp, parseHttpUrl, isPrivateIPv4, clampInt, shortText } from "../src/validate.js";

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
