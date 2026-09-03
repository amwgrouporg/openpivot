import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { unstable_dev } from "wrangler";
import worker from "../src/worker.js";

const assets = (body, type) => ({ ASSETS: { fetch: async () => new Response(body, { status: 200, headers: { "content-type": type } }) } });

test("served HTML carries a content security policy and refuses framing", async () => {
  const res = await worker.fetch(new Request("https://openpivot.test/"), assets("<!doctype html><title>x</title>", "text/html; charset=utf-8"));
  const csp = res.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(await res.text(), "<!doctype html><title>x</title>");
});

test("non-HTML assets get no page policy but still refuse sniffing", async () => {
  const res = await worker.fetch(new Request("https://openpivot.test/app.js"), assets("export {}", "text/javascript"));
  assert.equal(res.headers.get("content-security-policy"), null);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("api responses are not touched by the asset header layer", async () => {
  const res = await worker.fetch(new Request("https://openpivot.test/api/queries?q=x"), { ASSETS: { fetch: async () => { throw new Error("assets must not serve /api"); } } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-security-policy"), null);
});

// The stub-binding tests above prove the wrapper. Workers static assets answer matched files
// BEFORE the Worker unless the config says otherwise, so only a real workerd serving the real
// public/ directory proves the policy reaches the board page.
let served;

before(async () => {
  const startup = unstable_dev("src/worker.js", {
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
    logLevel: "error", ip: "127.0.0.1", port: 0, persist: false,
  });
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      startup.then((w) => w.stop()).catch(() => {});
      reject(new Error("workerd did not start within 30s"));
    }, 30000);
    timer.unref();
  });
  served = await Promise.race([startup, deadline]);
  clearTimeout(timer);
});

after(async () => { await served?.stop(); });

test("the board page as served by the asset layer carries the policy", async () => {
  const page = await served.fetch("/");
  assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  const demo = await served.fetch("/demo/injected");
  assert.match(demo.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const script = await served.fetch("/app.js");
  assert.equal(script.headers.get("x-content-type-options"), "nosniff");
  assert.equal(script.headers.get("content-security-policy"), null);
});

test("an asset layer failure is answered with a status, never thrown out of the Worker", async () => {
  const res = await worker.fetch(new Request("https://openpivot.test/"), { ASSETS: { fetch: async () => { throw new Error("assets down"); } } });
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(await res.text(), /assets down/);
});
