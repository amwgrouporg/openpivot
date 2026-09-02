import test from "node:test";
import assert from "node:assert/strict";
import { runPivot } from "../public/runs.js";
import { newCase } from "../public/store.js";

const entity = { id: "ent_domain", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" };

function envelope(sensor, status = "ok") {
  return {
    ok: status === "ok",
    sensor,
    source_url: `https://source.example/${sensor}`,
    fetched_at: "2026-09-01T10:00:01.000Z",
    status,
    data: status === "ok" ? { sensor } : null,
    error: status === "ok" ? null : "upstream timeout",
    untrusted: true,
  };
}

test("runPivot exposes queued, running, and terminal sensor states", async () => {
  const caseData = newCase("Runs");
  caseData.entities.push(entity);
  const updates = [];

  const result = await runPivot({
    caseData,
    entity,
    actor: "agent",
    specs: [{ route: "dns", params: { name: "example.com" } }],
    sensorCall: async () => envelope("dns"),
    onUpdate: (run) => updates.push(JSON.parse(JSON.stringify(run))),
  });

  assert.equal(updates[0].sensors[0].status, "queued");
  assert.equal(updates[1].sensors[0].status, "running");
  assert.equal(updates.at(-1).sensors[0].status, "ok");
  assert.equal(result.run.status, "ok");
  assert.equal(result.readings[0].sensor, "dns");
  assert.equal(caseData.runs.length, 1);
});

test("runPivot settles each sensor and marks a mixed run indeterminate", async () => {
  const caseData = newCase("Mixed run");
  caseData.entities.push(entity);

  const result = await runPivot({
    caseData,
    entity,
    actor: "human",
    specs: [{ route: "dns", params: {} }, { route: "rdap", params: {} }],
    sensorCall: async (route) => envelope(route, route === "dns" ? "ok" : "indeterminate"),
    onUpdate() {},
  });

  assert.equal(result.run.status, "indeterminate");
  assert.deepEqual(result.run.sensors.map((sensor) => sensor.status), ["ok", "indeterminate"]);
  assert.equal(result.readings.length, 2);
  assert.equal(caseData.runs.length, 1);
});

test("runPivot returns deduplicated candidate selectors", async () => {
  const caseData = newCase("Candidates");
  caseData.entities.push(entity);
  const dnsData = { name: "example.com", records: { A: [{ value: "192.0.2.1" }, { value: "192.0.2.1" }], AAAA: [], NS: [], MX: [], TXT: [], CNAME: [] }, rcodes: {}, failed_types: [] };

  const result = await runPivot({
    caseData,
    entity,
    actor: "agent",
    specs: [{ route: "dns", params: {} }],
    sensorCall: async () => ({ ...envelope("dns"), data: dnsData }),
    onUpdate() {},
  });

  assert.deepEqual(result.candidates, [{ type: "ip", value: "192.0.2.1", why: "A record", source_reading_id: result.readings[0].id }]);
});
