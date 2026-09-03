import { test } from "node:test";
import assert from "node:assert/strict";
import { Limiter } from "../src/limiter_do.js";
import { rateLimited } from "../src/worker.js";

const call = (l, body = { limit: 3, window_ms: 60000 }) => l.fetch(new Request("https://limiter/", { method: "POST", body: JSON.stringify(body) })).then((r) => r.json());

test("durable limiter allows up to the limit then refuses with retry_after", async () => {
  const l = new Limiter(fakeState());
  const a = await call(l); const b = await call(l); const c = await call(l); const d = await call(l);
  assert.deepEqual([a.allowed, b.allowed, c.allowed, d.allowed], [true, true, true, false]);
  assert.equal(c.remaining, 0);
  assert.ok(d.retry_after >= 1 && d.retry_after <= 60);
});

test("durable limiter falls back to defaults on a bad body", async () => {
  const l = new Limiter(fakeState());
  const r = await l.fetch(new Request("https://limiter/", { method: "POST", body: "not json" })).then((x) => x.json());
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 59);
});

function fakeNamespace(limiter) {
  return { idFromName: (k) => k, get: () => ({ fetch: (u, init) => limiter.fetch(new Request(u, init)) }) };
}

test("rateLimited: durable object verdict is authoritative", async () => {
  const l = new Limiter(fakeState());
  const env = { LIMITER: fakeNamespace(l) };
  const req = new Request("https://x/api/dns", { headers: { "cf-connecting-ip": "1.2.3.4" } });
  for (let i = 0; i < 60; i++) assert.equal((await rateLimited(req, env)).limited, false, `call ${i}`);
  const r = await rateLimited(req, env);
  assert.equal(r.limited, true);
  assert.ok(r.retry_after >= 1);
});

test("rateLimited fails closed when a layer throws or answers nonsense", async () => {
  const req = new Request("https://x/api/dns", { headers: { "cf-connecting-ip": "1.2.3.4" } });
  assert.equal((await rateLimited(req, { LIMITER: { idFromName: (k) => k, get: () => ({ fetch: async () => { throw new Error("boom"); } }) } })).limited, true);
  assert.equal((await rateLimited(req, { LIMITER: { idFromName: (k) => k, get: () => ({ fetch: async () => Response.json({}) }) } })).limited, true);
  assert.equal((await rateLimited(req, { RATE_LIMITER: { limit: async () => { throw new Error("boom"); } } })).limited, true);
  assert.equal((await rateLimited(req, { RATE_LIMITER: { limit: async () => ({ success: false }) } })).limited, true);
  assert.equal((await rateLimited(req, {})).limited, false);
});

function fakeState() {
  const store = new Map();
  return { storage: { get: async (key) => store.get(key), put: async (key, value) => { store.set(key, JSON.parse(JSON.stringify(value))); } } };
}

test("durable limiter count survives eviction of the object instance", async () => {
  const state = fakeState();
  const first = new Limiter(state);
  await call(first); await call(first); await call(first);
  const revived = new Limiter(state);
  const r = await call(revived);
  assert.equal(r.allowed, false);
  assert.equal(r.remaining, 0);
});

test("durable limiter refuses when storage fails instead of counting in memory", async () => {
  const state = { storage: { get: async () => undefined, put: async () => { throw new Error("storage down"); } } };
  await assert.rejects(call(new Limiter(state)), /storage down/);
});

test("durable limiter refuses when the stored hit list is not a list of timestamps", async () => {
  for (const stored of ["junk", [1, "x"], [Number.NaN], { hits: [] }]) {
    const state = { storage: { get: async () => stored, put: async () => {} } };
    await assert.rejects(call(new Limiter(state)), /hit list/i, JSON.stringify(stored));
  }
});

test("durable limiter drops future timestamps instead of counting them against the window", async () => {
  const now = Date.now();
  const state = { storage: { get: async () => [now + 3_600_000, now + 3_600_000, now + 3_600_000], put: async () => {} } };
  const r = await call(new Limiter(state));
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 2);
});
