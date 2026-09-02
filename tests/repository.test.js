import test from "node:test";
import assert from "node:assert/strict";
import { createLocalCaseRepository, migrateCaseV1 } from "../public/repository.js";
import {
  addCompletedRun,
  dismissCandidate,
  newCase,
  removeEntity,
  restoreCandidate,
  restoreRemoval,
} from "../public/store.js";

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

function legacyCase() {
  return {
    version: 1,
    id: "case_legacy",
    title: "Legacy investigation",
    created_at: "2026-09-01T10:00:00.000Z",
    entities: [{ id: "ent_domain", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:01:00.000Z" }],
    links: [],
    evidence: [],
    readings: [],
    memo: { human: "note", agent: "", agent_updated_at: null },
    log: [],
  };
}

test("v1 migration copies records and initializes cockpit state", () => {
  const before = legacyCase();
  const migrated = migrateCaseV1(before);

  assert.equal(migrated.version, 2);
  assert.equal(migrated.title, "Legacy investigation");
  assert.deepEqual(migrated.entities, before.entities);
  assert.notEqual(migrated.entities, before.entities);
  assert.deepEqual(migrated.ui, {
    selected_entity_id: null,
    graph_positions: {},
    dismissed_candidates: [],
  });
  assert.deepEqual(migrated.runs, []);
  assert.deepEqual(migrated.brief, { objective: "", scope: "", status: "active", updated_at: before.created_at });
  assert.equal(migrated.memo.gaps, "");
  assert.equal(migrated.memo.methodology, "");
  assert.equal(before.version, 1);
  assert.equal(before.ui, undefined);
});

test("repository migrates v1 once and retains the original backup", () => {
  const storage = memoryStorage([["openpivot.case.v1", JSON.stringify(legacyCase())]]);
  const repository = createLocalCaseRepository(storage);

  const loaded = repository.load();

  assert.equal(loaded.version, 2);
  assert.ok(storage.values.has("openpivot.case.v1"));
  assert.equal(JSON.parse(storage.values.get("openpivot.case.v2")).version, 2);
});

test("migration returns the legacy case with a recovery notice when v2 persistence fails", () => {
  const storage = memoryStorage([["openpivot.case.v1", JSON.stringify(legacyCase())]]);
  storage.setItem = (key, value) => {
    if (key === "openpivot.case.v2") throw new Error("quota exceeded");
    storage.values.set(key, value);
  };
  const repository = createLocalCaseRepository(storage);

  const loaded = repository.load();

  assert.equal(loaded.version, 2);
  assert.equal(loaded.title, "Legacy investigation");
  assert.equal(loaded.entities.length, 1);
  assert.match(repository.getRecoveryNotice(), /could not save the migrated case/i);
  assert.ok(storage.values.has("openpivot.case.v1"));
});

test("repository rejects malformed imports without overwriting the saved case", () => {
  const current = { ...migrateCaseV1(legacyCase()), title: "Keep me" };
  const storage = memoryStorage([["openpivot.case.v2", JSON.stringify(current)]]);
  const repository = createLocalCaseRepository(storage);

  assert.throws(() => repository.importJson('{"version":2,"title":"broken"}'), /invalid case/i);
  assert.equal(repository.load().title, "Keep me");
});

test("repository validates nested records before importing", () => {
  const current = migrateCaseV1(legacyCase());
  const storage = memoryStorage([["openpivot.case.v2", JSON.stringify(current)]]);
  const repository = createLocalCaseRepository(storage);
  const malformed = { ...current, evidence: [{ id: "evd_bad", url: "https://example.com", quote: "quote" }] };

  assert.throws(() => repository.importJson(JSON.stringify(malformed)), /evidence/i);
  assert.equal(repository.load().evidence.length, 0);
});

test("stored v2 cases are repaired without overwriting the original record", () => {
  const current = migrateCaseV1(legacyCase());
  current.runs.push({ id: "run_orphan", entity_id: "ent_missing", requested_by: "agent", started_at: "2026-09-01T10:00:00.000Z", completed_at: "2026-09-01T10:00:01.000Z", status: "ok", sensors: [] });
  current.entities.push({ id: "ent_bad", type: "person", value: "Unsupported", notes: "", added_by: "robot", added_at: "2026-09-01T10:00:00.000Z" });
  current.memo.agent_updated_at = 42;
  const raw = JSON.stringify(current);
  const storage = memoryStorage([["openpivot.case.v2", raw]]);
  const repository = createLocalCaseRepository(storage);

  const loaded = repository.load();

  assert.equal(loaded.title, "Legacy investigation");
  assert.equal(loaded.entities.length, 1);
  assert.deepEqual(loaded.runs, []);
  assert.equal(loaded.memo.agent_updated_at, null);
  assert.doesNotThrow(() => repository.exportJson(loaded));
  assert.match(repository.getRecoveryNotice(), /repaired/i);
  assert.equal(storage.values.get("openpivot.case.v2"), raw);
  assert.equal(storage.values.get("openpivot.case.v2.recovery"), raw);
});

test("candidate dismissal is reversible and deduplicated", () => {
  const caseData = newCase("Dismissals");

  dismissCandidate(caseData, "ent_1:ip:192.0.2.1");
  dismissCandidate(caseData, "ent_1:ip:192.0.2.1");
  assert.deepEqual(caseData.ui.dismissed_candidates, ["ent_1:ip:192.0.2.1"]);

  restoreCandidate(caseData, "ent_1:ip:192.0.2.1");
  assert.deepEqual(caseData.ui.dismissed_candidates, []);
});

test("entity removal snapshot restores affected records", () => {
  const caseData = newCase("Undo");
  caseData.entities = [
    { id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" },
    { id: "ent_2", type: "ip", value: "192.0.2.1", notes: "", added_by: "agent", added_at: "2026-09-01T10:01:00.000Z" },
    { id: "ent_3", type: "org", value: "Example Org", notes: "", added_by: "human", added_at: "2026-09-01T10:01:30.000Z" },
  ];
  caseData.links = [
    { id: "lnk_1", from: "ent_1", to: "ent_2", rationale: "DNS", asserted_by: "agent", status: "proposed", at: "2026-09-01T10:02:00.000Z", citations: [] },
    { id: "lnk_2", from: "ent_1", to: "ent_3", rationale: "Owner", asserted_by: "agent", status: "proposed", at: "2026-09-01T10:02:30.000Z", citations: [{ kind: "reading", id: "rdg_1" }] },
  ];
  caseData.readings = [{ id: "rdg_1", entity_id: "ent_2", sensor: "rdap", status: "ok" }];
  caseData.evidence = [{ id: "evd_1", entity_ids: ["ent_2"], url: "https://example.com", quote: "quote", reading_id: "rdg_1" }];
  caseData.runs = [{ id: "run_1", entity_id: "ent_2", requested_by: "agent", started_at: "2026-09-01T10:00:00.000Z", completed_at: "2026-09-01T10:00:01.000Z", status: "ok", sensors: [] }];
  caseData.ui.graph_positions.ent_2 = { x: 100, y: 80 };
  caseData.ui.dismissed_candidates = ["ent_2:domain:host.example", "ent_1:ip:192.0.2.1"];

  const snapshot = removeEntity(caseData, "ent_2", "human");
  assert.equal(caseData.entities.length, 2);
  assert.equal(caseData.links.length, 1);
  assert.deepEqual(caseData.links[0].citations, []);
  assert.equal(caseData.readings.length, 0);
  assert.deepEqual(caseData.evidence[0].entity_ids, []);
  assert.equal(caseData.evidence[0].reading_id, null);
  assert.equal(caseData.runs.length, 0);
  assert.equal(caseData.ui.graph_positions.ent_2, undefined);
  assert.deepEqual(caseData.ui.dismissed_candidates, ["ent_1:ip:192.0.2.1"]);

  restoreRemoval(caseData, snapshot);
  assert.equal(caseData.entities.length, 3);
  assert.equal(caseData.links.length, 2);
  assert.deepEqual(caseData.links.find((link) => link.id === "lnk_2").citations, [{ kind: "reading", id: "rdg_1" }]);
  assert.equal(caseData.readings.length, 1);
  assert.deepEqual(caseData.evidence[0].entity_ids, ["ent_2"]);
  assert.equal(caseData.evidence[0].reading_id, "rdg_1");
  assert.equal(caseData.runs.length, 1);
  assert.deepEqual(caseData.ui.graph_positions.ent_2, { x: 100, y: 80 });
  assert.deepEqual(caseData.ui.dismissed_candidates, ["ent_2:domain:host.example", "ent_1:ip:192.0.2.1"]);
});

test("completed runs are appended while active runs are refused", () => {
  const caseData = newCase("Runs");
  const complete = { id: "run_1", entity_id: "ent_1", requested_by: "agent", started_at: "2026-09-01T10:00:00.000Z", completed_at: "2026-09-01T10:00:01.000Z", status: "ok", sensors: [] };

  addCompletedRun(caseData, complete);
  assert.deepEqual(caseData.runs, [complete]);
  assert.throws(() => addCompletedRun(caseData, { ...complete, id: "run_2", completed_at: null }), /completed/i);
});

test("new cyber investigation cases include brief and findings fields", () => {
  const caseData = newCase("Cyber case");
  assert.deepEqual(caseData.brief, { objective: "", scope: "", status: "active", updated_at: caseData.created_at });
  assert.deepEqual(caseData.memo, { human: "", gaps: "", methodology: "", agent: "", agent_updated_at: null });
});
