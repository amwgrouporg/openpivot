import { test } from "node:test";
import assert from "node:assert/strict";
import { ok, indeterminate, STATUS } from "../src/envelope.js";

test("ok envelope carries the fixed shape and untrusted flag", () => {
  const e = ok("dns", "https://x", { a: 1 });
  assert.equal(e.ok, true);
  assert.equal(e.status, STATUS.OK);
  assert.equal(e.untrusted, true);
  assert.equal(e.error, null);
  assert.deepEqual(e.data, { a: 1 });
  assert.match(e.fetched_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("indeterminate never reads as ok and keeps partial data", () => {
  const e = indeterminate("certs", "https://x", new Error("timeout"), { partial: true });
  assert.equal(e.ok, false);
  assert.equal(e.status, STATUS.INDETERMINATE);
  assert.equal(e.error, "Error: timeout");
  assert.deepEqual(e.data, { partial: true });
});

test("indeterminate with no error text still has an error string", () => {
  assert.equal(indeterminate("x", null, undefined).error, "unknown error");
});
