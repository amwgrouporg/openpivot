import test from "node:test";
import assert from "node:assert/strict";
import {
  connectedComponents,
  edgePresentation,
  filterGraph,
  labelModeForCount,
  layoutTargets,
  neighborhoodIds,
  nodeAccessibleName,
  nodeMetadata,
  parallelEdgeOffsets,
  relationshipAccessibleName,
  shortestPath,
} from "../public/graph-model.js";
import { newCase } from "../public/store.js";
import { nextPathSelection } from "../public/ui/graph-controls.js";

function fixtureCase() {
  const caseData = newCase("Graph analysis");
  caseData.entities = [
    { id: "a", type: "domain", value: "example.test", added_by: "human" },
    { id: "b", type: "ip", value: "192.0.2.1", added_by: "agent" },
    { id: "c", type: "org", value: "Example Org", added_by: "human" },
  ];
  caseData.links = [
    { id: "ab", from: "a", to: "b", relationship_type: "resolves_to", status: "accepted", at: "2026-09-03T10:30:00Z" },
    { id: "old-context", from: "a", to: "b", relationship_type: "references", status: "accepted", at: "2026-08-01T10:30:00Z" },
  ];
  caseData.readings = [
    { id: "baseline-a", entity_id: "a", status: "ok", fetched_at: "2026-09-03T11:30:00Z" },
    { id: "baseline-b", entity_id: "b", status: "ok", fetched_at: "2026-09-03T11:30:00Z" },
  ];
  return caseData;
}

test("node metadata prioritizes inconclusive collection and counts evidence", () => {
  const c = fixtureCase();
  c.readings.push({ id: "r1", entity_id: "a", status: "ok", fetched_at: "2026-09-03T10:00:00Z" });
  c.readings.push({ id: "r2", entity_id: "a", status: "indeterminate", fetched_at: "2026-09-03T11:00:00Z" });
  c.evidence.push({ id: "e1", entity_ids: ["a"], captured_at: "2026-09-03T12:00:00Z" });
  assert.deepEqual(nodeMetadata(c).get("a"), {
    collectionStatus: "indeterminate", evidenceCount: 1, relationshipCount: 2,
    lastCaseActivityAt: "2026-09-03T12:00:00Z",
  });
});

test("edge presentation distinguishes directional and symmetric types", () => {
  assert.deepEqual(edgePresentation({
    relationship_type: "resolves_to", status: "proposed", citations: [{ id: "r1" }],
  }), { directional: true, marker: "arrow-proposed", pattern: "6 5", label: "resolves to · 1 source" });
  assert.equal(edgePresentation({ relationship_type: "associated_with", status: "accepted", citations: [] }).directional, false);
  assert.equal(edgePresentation({ relationship_type: "associated_with", status: "accepted", citations: [] }).label, "associated with");
});

test("node accessible name includes state without overclaiming", () => {
  const label = nodeAccessibleName({
    type: "domain", value: "example.com", added_by: "agent",
    metadata: { collectionStatus: "indeterminate", evidenceCount: 2, relationshipCount: 3 },
    inPath: true,
  });
  assert.match(label, /Collection inconclusive/);
  assert.match(label, /2 evidence entries/);
  assert.doesNotMatch(label, /verified|confirmed|attributed/i);
});

test("relationship accessible name resolves endpoints, direction, and path state", () => {
  const entities = [
    { id: "a", value: "example.com" },
    { id: "b", value: "192.0.2.1" },
  ];
  const directional = relationshipAccessibleName({
    from: "a", to: "b", relationship_type: "resolves_to", status: "accepted",
    rationale: "Observed DNS answer", citations: [{ id: "r1" }],
  }, entities, { inPath: true });
  const symmetric = relationshipAccessibleName({
    from: "b", to: "a", relationship_type: "associated_with", status: "proposed",
    rationale: "Network registration", citations: [],
  }, entities);

  assert.match(directional, /directional relationship from example\.com to 192\.0\.2\.1/);
  assert.match(directional, /resolves to/);
  assert.match(directional, /included in traced path/);
  assert.match(symmetric, /symmetric relationship between 192\.0\.2\.1 and example\.com/);
  assert.doesNotMatch(`${directional} ${symmetric}`, /verified|confirmed|attributed/i);
});

test("relationship accessible details include proposing actor and activity-window context", () => {
  const label = relationshipAccessibleName({
    id: "ab",
    from: "a",
    to: "b",
    relationship_type: "resolves_to",
    status: "proposed",
    rationale: "DNS response",
    asserted_by: "agent",
    contextual: true,
    citations: [],
  }, fixtureCase().entities);

  assert.match(label, /proposed by agent/i);
  assert.match(label, /outside the selected case-activity window/i);
});

test("neighborhood and path traversal are undirected but preserve link ids", () => {
  const links = [{ id: "ab", from: "a", to: "b" }, { id: "bc", from: "b", to: "c" }];
  assert.deepEqual([...neighborhoodIds(links, "a", 1)].sort(), ["a", "b"]);
  assert.deepEqual([...neighborhoodIds(links, "a", 2)].sort(), ["a", "b", "c"]);
  assert.deepEqual(shortestPath(links, "a", "c"), { nodeIds: ["a", "b", "c"], linkIds: ["ab", "bc"] });
});

test("a third path selection starts a fresh transient path", () => {
  const links = [{ id: "ab", from: "a", to: "b" }, { id: "bc", from: "b", to: "c" }];
  const completed = nextPathSelection(nextPathSelection({ pathStartId: null, pathEndId: null }, "a", links), "c", links);
  const restarted = nextPathSelection(completed, "b", links);

  assert.deepEqual(restarted, { pathStartId: "b", pathEndId: null, path: null });
});

test("connected components retain isolated entities", () => {
  assert.deepEqual(connectedComponents([{ id: "a" }, { id: "b" }, { id: "c" }], [{ from: "a", to: "b" }]), [["a", "b"], ["c"]]);
});

test("case activity is deterministic and marks contextual edges", () => {
  const result = filterGraph(fixtureCase(), { activityWindow: "24h", now: "2026-09-03T12:00:00Z" });
  assert.deepEqual(result.nodes.map((n) => n.id).sort(), ["a", "b"]);
  assert.equal(result.links.find((l) => l.id === "old-context").contextual, true);
});

test("recent eligible relationships keep endpoints active and update metadata", () => {
  const c = fixtureCase();
  c.entities = c.entities.map((entity) => ({ ...entity, added_at: "2026-08-01T10:00:00Z" }));
  c.readings = [];
  c.links = [{
    id: "fresh-link", from: "a", to: "b", relationship_type: "resolves_to", status: "accepted",
    at: "2026-09-03T11:30:00Z",
  }];

  const result = filterGraph(c, { activityWindow: "24h", now: "2026-09-03T12:00:00Z" });

  assert.deepEqual(result.nodes.map((node) => node.id).sort(), ["a", "b"]);
  assert.equal(result.nodes.find((node) => node.id === "a").metadata.lastCaseActivityAt, "2026-09-03T11:30:00Z");
  assert.equal(result.nodes.find((node) => node.id === "b").metadata.lastCaseActivityAt, "2026-09-03T11:30:00Z");
});

test("parallel edge offsets are stable", () => {
  const links = [
    { id: "one", from: "a", to: "b", relationship_type: "resolves_to" },
    { id: "two", from: "a", to: "b", relationship_type: "references" },
    { id: "three", from: "b", to: "a", relationship_type: "redirects_to" },
  ];
  assert.deepEqual([...parallelEdgeOffsets(links)], [["one", -40], ["three", 0], ["two", 40]]);
});

test("parallel edge centerlines stay outside adjacent pointer hit targets", () => {
  const links = [
    { id: "one", from: "a", to: "b", relationship_type: "resolves_to" },
    { id: "two", from: "a", to: "b", relationship_type: "references" },
    { id: "three", from: "b", to: "a", relationship_type: "redirects_to" },
  ];
  const offsets = [...parallelEdgeOffsets(links).values()].sort((left, right) => left - right);

  assert.equal((offsets[1] - offsets[0]) / 2 > 18, true);
  assert.equal((offsets[2] - offsets[1]) / 2 > 18, true);
});

test("parallel edge groups are ordered by their unordered endpoints", () => {
  const offsets = parallelEdgeOffsets([
    { id: "bc", from: "b", to: "c", relationship_type: "references" },
    { id: "ab", from: "a", to: "b", relationship_type: "references" },
  ]);
  assert.deepEqual([...offsets], [["ab", 0], ["bc", 0]]);
});

test("automatic label density follows the documented thresholds", () => {
  assert.equal(labelModeForCount(59, "auto"), "all");
  assert.equal(labelModeForCount(60, "auto"), "neighbors");
  assert.equal(labelModeForCount(150, "auto"), "neighbors");
  assert.equal(labelModeForCount(151, "auto"), "focus");
});

test("stale neighborhood focus does not hide an otherwise valid graph", () => {
  const result = filterGraph(fixtureCase(), { selectedId: "missing", hops: 1 });
  assert.deepEqual(result.nodes.map((node) => node.id).sort(), ["a", "b", "c"]);
  assert.equal(result.links.length, 2);
});

test("density notice follows the requested label mode", () => {
  const caseData = newCase("Dense labels");
  caseData.entities = Array.from({ length: 60 }, (_, index) => ({
    id: `ent_${index}`,
    type: "domain",
    value: `host-${index}.example.com`,
    notes: "",
    added_by: "human",
    added_at: "2026-09-03T10:00:00Z",
  }));

  assert.equal(filterGraph(caseData, { labels: "all" }).density.reduceLabels, false);
  assert.equal(filterGraph(caseData, { labels: "all" }).density.message, "");
  assert.equal(filterGraph(caseData, { labels: "auto" }).density.reduceLabels, true);
});

test("layouts use fixed lanes and breadth-first radial rings", () => {
  const nodes = [
    { id: "a", type: "domain" },
    { id: "b", type: "url" },
    { id: "c", type: "ip" },
  ];
  const links = [{ id: "ab", from: "a", to: "b" }, { id: "bc", from: "b", to: "c" }];
  assert.deepEqual([...layoutTargets(nodes, links, { layout: "lanes", width: 700, height: 400 })], [
    ["a", { x: 100, y: 200 }], ["b", { x: 200, y: 200 }], ["c", { x: 300, y: 200 }],
  ]);
  assert.deepEqual([...layoutTargets(nodes, links, { layout: "radial", selectedId: "a", width: 400, height: 400 })], [
    ["a", { x: 200, y: 200 }], ["b", { x: 290, y: 200 }], ["c", { x: 380, y: 200 }],
  ]);
});
