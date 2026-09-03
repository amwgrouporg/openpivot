import test from "node:test";
import assert from "node:assert/strict";
import {
  applyNodeDrag,
  createGraph,
  edgePath,
  graphEdgeLabelIds,
  graphLabelIds,
  graphListModel,
  mergeGraphPositions,
  nodeStateClasses,
  nodesForFit,
  resetGraphLayoutNodes,
  settleImmediately,
} from "../public/graph.js";
import { newCase } from "../public/store.js";

function graphCase() {
  const caseData = newCase("Graph");
  caseData.entities = [
    { id: "ent_1", type: "domain", value: "example.com", added_by: "human" },
    { id: "ent_2", type: "ip", value: "192.0.2.1", added_by: "agent" },
    { id: "ent_3", type: "org", value: "Example Org", added_by: "human" },
  ];
  caseData.links = [
    { id: "lnk_1", from: "ent_1", to: "ent_2", status: "accepted", rationale: "DNS" },
    { id: "lnk_2", from: "ent_2", to: "ent_3", status: "proposed", rationale: "Owner" },
    { id: "lnk_3", from: "ent_1", to: "ent_3", status: "rejected", rationale: "Weak" },
  ];
  caseData.ui.graph_positions = { ent_1: { x: 120, y: 80 } };
  return caseData;
}

test("graph hides rejected relationships unless the filter requests them", () => {
  const caseData = graphCase();
  assert.deepEqual(graphListModel(caseData, {}).links.map((link) => link.id), ["lnk_1", "lnk_2"]);
  assert.deepEqual(graphListModel(caseData, { statuses: ["rejected"] }).links.map((link) => link.id), ["lnk_3"]);
});

test("graph model carries saved node positions into rendering", () => {
  const node = graphListModel(graphCase(), {}).nodes.find((item) => item.id === "ent_1");
  assert.deepEqual(node.position, { x: 120, y: 80 });
});

test("graph list compatibility wrapper preserves the analysis density summary", () => {
  assert.deepEqual(graphListModel(graphCase(), {}).density, {
    nodeCount: 3,
    linkCount: 2,
    reduceLabels: false,
    message: "",
  });
});

test("connected filter retains the selection and its direct neighbors", () => {
  const model = graphListModel(graphCase(), { connectedTo: "ent_1" });
  assert.deepEqual(model.nodes.map((node) => node.id).sort(), ["ent_1", "ent_2"]);
  assert.deepEqual(model.links.map((link) => link.id), ["lnk_1"]);
});

test("type filter removes links whose endpoints are not visible", () => {
  const model = graphListModel(graphCase(), { types: ["domain", "org"], includeRejected: true });
  assert.deepEqual(model.nodes.map((node) => node.type), ["domain", "org"]);
  assert.deepEqual(model.links.map((link) => link.id), ["lnk_3"]);
});

test("filtered graph position updates preserve hidden node positions", () => {
  const current = { ent_1: { x: 10, y: 20 }, ent_hidden: { x: 80, y: 90 } };
  assert.deepEqual(mergeGraphPositions(current, { ent_1: { x: 30, y: 40 } }), { ent_1: { x: 30, y: 40 }, ent_hidden: { x: 80, y: 90 } });
  assert.deepEqual(mergeGraphPositions(current, {}, { replace: true }), {});
});

test("reduced-motion settling repaints after synchronous ticks", () => {
  const calls = [];
  const simulation = {
    alpha(value) { calls.push(["alpha", value]); return this; },
    tick(count) { calls.push(["tick", count]); return this; },
    stop() { calls.push(["stop"]); return this; },
  };

  settleImmediately(simulation, () => calls.push(["paint"]));

  assert.deepEqual(calls, [["alpha", 1], ["tick", 80], ["stop"], ["paint"]]);
});

test("reduced-motion dragging updates coordinates, repaints, and publishes on end", () => {
  const node = { id: "a", x: 10, y: 20, fx: null, fy: null };
  const calls = [];
  const options = {
    reducedMotion: true,
    paint: () => calls.push(["paint", node.x, node.y]),
    publish: () => calls.push(["publish", node.x, node.y]),
  };

  applyNodeDrag(node, { x: 30, y: 40 }, options);
  applyNodeDrag(node, { x: 50, y: 60 }, { ...options, ending: true });

  assert.deepEqual(node, { id: "a", x: 50, y: 60, fx: null, fy: null });
  assert.deepEqual(calls, [["paint", 30, 40], ["paint", 50, 60], ["publish", 50, 60]]);
});

test("reduced-motion radial drag end repaints and publishes the fixed center", () => {
  const node = { id: "focus", x: 40, y: 50, fx: 40, fy: 50 };
  const calls = [];

  applyNodeDrag(node, { x: 310, y: 280 }, {
    reducedMotion: true,
    ending: true,
    fixedPosition: { x: 200, y: 180 },
    paint: () => calls.push(["paint", node.x, node.y, node.fx, node.fy]),
    publish: () => calls.push(["publish", node.x, node.y, node.fx, node.fy]),
  });

  assert.deepEqual(node, { id: "focus", x: 200, y: 180, fx: 200, fy: 180 });
  assert.deepEqual(calls, [
    ["paint", 200, 180, 200, 180],
    ["publish", 200, 180, 200, 180],
  ]);
});

test("renderer label modes respect the selected entity and graph density", () => {
  const nodes = [
    { id: "ent_1" }, { id: "ent_2" }, { id: "ent_3" },
  ];
  const links = [{ from: "ent_1", to: "ent_2" }];

  assert.deepEqual([...graphLabelIds(nodes, links, { requested: "focus", selectedId: "ent_1" })], ["ent_1"]);
  const denseNodes = Array.from({ length: 60 }, (_, index) => ({ id: `ent_${index}` }));
  assert.deepEqual([...graphLabelIds(denseNodes, links, { requested: "auto", selectedId: "ent_1" })].sort(), ["ent_1", "ent_2"]);

  const veryDenseNodes = Array.from({ length: 151 }, (_, index) => ({ id: `ent_${index}` }));
  assert.deepEqual(
    [...graphLabelIds(veryDenseNodes, links, { requested: "auto", selectedId: "ent_1", pathNodeIds: ["ent_8"] })].sort(),
    ["ent_1", "ent_8"],
  );
});

test("relationship label LOD follows density while retaining focus, hover, and path context", () => {
  const links = [
    { id: "ab", from: "a", to: "b" },
    { id: "ac", from: "a", to: "c" },
    { id: "bc", from: "b", to: "c" },
    { id: "de", from: "d", to: "e" },
  ];
  const nodes = (count) => ["a", "b", "c", "d", "e", ...Array.from({ length: count - 5 }, (_, index) => `n${index}`)].map((id) => ({ id }));

  assert.deepEqual([...graphEdgeLabelIds(nodes(59), links, { requested: "auto" })], ["ab", "ac", "bc", "de"]);
  assert.deepEqual([...graphEdgeLabelIds(nodes(60), links, { requested: "auto", selectedId: "a" })], ["ab", "ac", "bc"]);
  assert.deepEqual([...graphEdgeLabelIds(nodes(151), links, { requested: "auto", selectedId: "a" })], ["ab", "ac"]);
  assert.deepEqual(
    [...graphEdgeLabelIds(nodes(151), links, { requested: "auto", selectedId: "a", hoveredLinkId: "de", pathLinkIds: ["bc"] })],
    ["bc", "de", "ab", "ac"],
  );
});

test("selection-aware fit includes one-hop neighbors and excludes unrelated graph nodes", () => {
  const nodes = [
    { id: "ent_1", x: 20, y: 20 },
    { id: "ent_2", x: 220, y: 220 },
    { id: "ent_3", x: 900, y: 900 },
  ];
  const links = [{ from: "ent_1", to: "ent_2" }];

  assert.deepEqual(nodesForFit(nodes, "ent_2", links), [
    { id: "ent_1", x: 20, y: 20 },
    { id: "ent_2", x: 220, y: 220 },
  ]);
  assert.equal(typeof createGraph(null).fitSelection, "function");
});

test("semantic edge geometry uses a quadratic curve offset", () => {
  assert.equal(edgePath({ source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, curveOffset: 20 }), "M0,0 Q50,20 100,0");
});

test("reverse relationships retain distinct physical curves", () => {
  const forward = edgePath({ from: "a", to: "b", source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, curveOffset: -9 });
  const reverse = edgePath({ from: "b", to: "a", source: { x: 100, y: 0 }, target: { x: 0, y: 0 }, curveOffset: 9 });

  assert.notEqual(forward, reverse);
  assert.match(forward, /Q50,-9/);
  assert.match(reverse, /Q50,9/);
});

test("node states distinguish focus, neighbors, paths, and dimmed entities", () => {
  const context = {
    selectedId: "a",
    hoveredId: null,
    neighborIds: new Set(["a", "b"]),
    pathNodeIds: new Set(["c"]),
  };
  assert.match(nodeStateClasses("a", context), /is-selected/);
  assert.match(nodeStateClasses("b", context), /is-neighbor/);
  assert.match(nodeStateClasses("c", context), /is-path/);
  assert.match(nodeStateClasses("d", context), /is-dimmed/);
});

test("reset reapplies active lanes and radial layout targets", () => {
  const laneNodes = [
    { id: "domain", type: "domain", x: 4, y: 4, fx: 4, fy: 4 },
    { id: "ip", type: "ip", x: 5, y: 5, fx: 5, fy: 5 },
  ];
  resetGraphLayoutNodes(laneNodes, [], { layout: "lanes", width: 700, height: 400 });
  assert.deepEqual(laneNodes.map(({ id, x, y, fx, fy }) => ({ id, x, y, fx, fy })), [
    { id: "domain", x: 100, y: 200, fx: 100, fy: 200 },
    { id: "ip", x: 300, y: 200, fx: 300, fy: 200 },
  ]);

  const radialNodes = [
    { id: "a", type: "domain", x: 0, y: 0, fx: 0, fy: 0 },
    { id: "b", type: "ip", x: 0, y: 0, fx: 0, fy: 0 },
  ];
  resetGraphLayoutNodes(radialNodes, [{ from: "a", to: "b" }], { layout: "radial", selectedId: "a", width: 400, height: 400 });
  assert.deepEqual(radialNodes.map(({ id, x, y, fx, fy }) => ({ id, x, y, fx, fy })), [
    { id: "a", x: 200, y: 200, fx: 200, fy: 200 },
    { id: "b", x: 290, y: 200, fx: 290, fy: 200 },
  ]);
});

test("force reset seeds distinct finite positions before restarting the simulation", () => {
  const nodes = [
    { id: "a", x: 4, y: 4, fx: 4, fy: 4 },
    { id: "b", x: 5, y: 5, fx: 5, fy: 5 },
    { id: "c", x: 6, y: 6, fx: 6, fy: 6 },
  ];

  resetGraphLayoutNodes(nodes, [], { layout: "force", width: 600, height: 400 });

  assert.equal(nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)), true);
  assert.equal(new Set(nodes.map((node) => `${node.x},${node.y}`)).size, nodes.length);
  assert.equal(nodes.every((node) => node.fx === null && node.fy === null), true);
});
