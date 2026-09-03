import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { filterGraph } from "../public/graph-model.js";

function syntheticCase(entityCount, relationshipCount) {
  const entities = Array.from({ length: entityCount }, (_, index) => ({
    id: `ent_${index}`,
    type: index % 2 === 0 ? "domain" : "ip",
    value: index % 2 === 0 ? `host-${index}.example` : `192.0.2.${index % 255}`,
    added_by: index % 3 === 0 ? "agent" : "human",
    added_at: "2026-09-03T10:00:00Z",
  }));
  const links = Array.from({ length: relationshipCount }, (_, index) => ({
    id: `lnk_${index}`,
    from: entities[index % entityCount].id,
    to: entities[(index * 17 + 1) % entityCount].id,
    relationship_type: index % 2 === 0 ? "resolves_to" : "associated_with",
    status: index % 3 === 0 ? "proposed" : "accepted",
    at: "2026-09-03T11:00:00Z",
    citations: [],
  }));
  return { entities, links, readings: [], evidence: [], ui: { graph_positions: {} } };
}

test("250 entities and 500 relationships fit the pure-model budget", () => {
  const c = syntheticCase(250, 500);
  const started = performance.now();
  const result = filterGraph(c, { statuses: ["accepted", "proposed"], hops: "all", activityWindow: "all", now: "2026-09-03T12:00:00Z" });
  const elapsed = performance.now() - started;
  assert.equal(result.nodes.length, 250);
  assert.equal(result.links.length, 500);
  assert.ok(elapsed < 100, `pure model took ${elapsed}ms`);
});
