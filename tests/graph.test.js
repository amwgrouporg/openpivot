import test from "node:test";
import assert from "node:assert/strict";
import { graphListModel, mergeGraphPositions } from "../public/graph.js";
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
