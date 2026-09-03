import test from "node:test";
import assert from "node:assert/strict";
import { createToolset } from "../public/tools.js";
import { newCase } from "../public/store.js";
import { createRegistry } from "../public/webmcp.js";

function registryDouble() {
  const tools = new Map();
  return {
    register: async (tool) => { tools.set(tool.name, tool); return true; },
    unregister: (name) => tools.delete(name),
    has: (name) => tools.has(name),
    names: () => [...tools.keys()],
    tools,
  };
}

function harness(caseData = newCase("Tools")) {
  const registry = registryDouble();
  const selected = [];
  const candidateSets = [];
  const toolset = createToolset({
    getCase: () => caseData,
    persist() {},
    registry,
    async archiveUrl() { return null; },
    async runEntityPivot(entity, type, archive) { return { entity, readings: [], candidates: [], type, archive }; },
    onSelect: (id) => selected.push(id),
    onCandidates: (id, candidates) => candidateSets.push([id, candidates]),
  });
  return { caseData, registry, selected, candidateSets, toolset };
}

test("an empty case registers the original ten tools in order", async () => {
  const { registry, toolset } = harness();
  await toolset.registerStaticTools();

  assert.deepEqual(registry.names(), [
    "read_case",
    "add_entity",
    "link_entities",
    "attach_evidence",
    "search_web",
    "lookup_wikidata",
    "extract_page",
    "build_queries",
    "write_memo",
    "export_case",
  ]);
});

test("adding the first domain exposes pivot_domain as tool eleven", async () => {
  const { caseData, registry, toolset } = harness();
  await toolset.registerStaticTools();
  const addEntity = registry.tools.get("add_entity");

  await addEntity.execute({ type: "domain", value: "example.com" });
  await toolset.syncDynamicTools();

  assert.equal(registry.names().length, 11);
  assert.equal(registry.names().at(-1), "pivot_domain");
  assert.equal(caseData.entities[0].value, "example.com");
});

test("domain IP and URL entities expose the three dynamic pivots without changing static names", async () => {
  const { caseData, registry, toolset } = harness();
  caseData.entities = [
    { id: "domain", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" },
    { id: "ip", type: "ip", value: "192.0.2.1", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" },
    { id: "url", type: "url", value: "https://example.com/", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" },
  ];

  await toolset.registerStaticTools();
  await toolset.syncDynamicTools();

  assert.deepEqual(registry.names(), [
    "read_case", "add_entity", "link_entities", "attach_evidence", "search_web",
    "lookup_wikidata", "extract_page", "build_queries", "write_memo", "export_case",
    "pivot_domain", "pivot_ip", "pivot_url",
  ]);
});

test("legacy link input still creates a proposed relationship", async () => {
  const caseData = newCase("Legacy call");
  caseData.entities = [
    { id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" },
    { id: "ent_2", type: "ip", value: "192.0.2.1", notes: "", added_by: "human", added_at: "2026-09-01T10:01:00.000Z" },
  ];
  const { registry, toolset } = harness(caseData);
  await toolset.registerStaticTools();

  const result = await registry.tools.get("link_entities").execute({ from_id: "ent_1", to_id: "ent_2", rationale: "DNS A record" });

  assert.equal(result.link.status, "proposed");
  assert.deepEqual(result.link.citations, []);
  assert.equal(result.link.relationship_type, "associated_with");
});

test("tools accept optional technical relationship type and evidence relevance", async () => {
  const caseData = newCase("Cyber semantics");
  caseData.entities = [
    { id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" },
    { id: "ent_2", type: "ip", value: "192.0.2.1", notes: "", added_by: "human", added_at: "2026-09-01T10:01:00.000Z" },
  ];
  const { registry, toolset } = harness(caseData);
  await toolset.registerStaticTools();

  const relationship = await registry.tools.get("link_entities").execute({ from_id: "ent_1", to_id: "ent_2", rationale: "DNS A response", relationship_type: "resolves_to" });
  const evidence = await registry.tools.get("attach_evidence").execute({ entity_ids: ["ent_1"], url: "https://example.com/source", quote: "A 192.0.2.1", relevance: "Supports the observed resolution" });

  assert.equal(relationship.link.relationship_type, "resolves_to");
  assert.equal(evidence.evidence.relevance, "Supports the observed resolution");
});

test("legacy evidence input remains valid", async () => {
  const { registry, toolset } = harness();
  await toolset.registerStaticTools();

  const result = await registry.tools.get("attach_evidence").execute({ url: "https://example.com/source", quote: "Example quote" });

  assert.equal(result.evidence.url, "https://example.com/source");
  assert.equal(result.evidence.reading_id, null);
  assert.equal(result.archived, false);
});

test("archive submission state survives evidence attachment", async () => {
  const caseData = newCase("Archive evidence");
  const registry = registryDouble();
  const toolset = createToolset({
    getCase: () => caseData,
    persist() {},
    registry,
    async archiveUrl() { return { archive_status: "pending", archived_url: null, archive_check_url: "https://web.archive.org/web/*/https://example.com/source" }; },
    async runEntityPivot() { return { readings: [], candidates: [] }; },
  });
  await toolset.registerStaticTools();

  const result = await registry.tools.get("attach_evidence").execute({ url: "https://example.com/source", quote: "Example quote", archive: true });

  assert.equal(result.evidence.archive_status, "pending");
  assert.equal(result.evidence.archive_check_url, "https://web.archive.org/web/*/https://example.com/source");
  assert.equal(result.archived, false);
});

test("removing the final typed entity unregisters its pivot", async () => {
  const { caseData, registry, toolset } = harness();
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  await toolset.registerStaticTools();
  await toolset.syncDynamicTools();
  assert.equal(registry.has("pivot_domain"), true);

  caseData.entities = [];
  await toolset.syncDynamicTools();
  assert.equal(registry.has("pivot_domain"), false);
  assert.equal(registry.names().length, 10);
});

test("add_entity waits for delayed dynamic registration before returning", async () => {
  const caseData = newCase("Delayed registration");
  let releasePivot;
  const registered = new Map();
  const modelContext = {
    async registerTool(tool) {
      if (tool.name === "pivot_domain") await new Promise((resolve) => { releasePivot = resolve; });
      registered.set(tool.name, tool);
    },
    unregisterTool(name) { registered.delete(name); },
  };
  const registry = createRegistry(modelContext);
  const toolset = createToolset({
    getCase: () => caseData,
    persist() {},
    registry,
    async archiveUrl() { return null; },
    async runEntityPivot() { return { readings: [], candidates: [] }; },
  });
  await toolset.registerStaticTools();
  let settled = false;

  const call = registered.get("add_entity").execute({ type: "domain", value: "example.com" }).then(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(settled, false);
  assert.equal(registry.names().length, 10);

  releasePivot();
  await call;
  assert.equal(registry.names().length, 11);
});

test("stateful collection tools do not claim to be read only", async () => {
  const { toolset } = harness();
  const byName = new Map(toolset.staticTools.map((tool) => [tool.name, tool]));

  for (const name of ["search_web", "lookup_wikidata", "extract_page"]) {
    assert.notEqual(byName.get(name).annotations?.readOnlyHint, true, name);
    assert.equal(byName.get(name).annotations?.untrustedContentHint, true, name);
  }
  assert.equal(byName.get("read_case").annotations.readOnlyHint, true);
  assert.equal(byName.get("build_queries").annotations.readOnlyHint, true);
  assert.equal(byName.get("export_case").annotations.readOnlyHint, true);
});

test("agent deduplication cannot append notes to an investigator entity and is audited", async () => {
  const caseData = newCase("Actor boundary");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "Investigator context", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const { registry, toolset } = harness(caseData);
  await toolset.registerStaticTools();

  const result = await registry.tools.get("add_entity").execute({ type: "domain", value: "example.com", notes: "Agent-supplied context" });

  assert.equal(result.created, false);
  assert.equal(caseData.entities[0].notes, "Investigator context");
  assert.equal(caseData.entities[0].added_by, "human");
  assert.equal(caseData.log[0].actor, "agent");
  assert.equal(caseData.log[0].action, "reuse_entity");
  assert.doesNotMatch(caseData.log[0].detail, /Agent-supplied context/);
});

test("attach_evidence publishes the exact quote length limit", () => {
  const { toolset } = harness();
  const descriptor = toolset.staticTools.find((tool) => tool.name === "attach_evidence");
  assert.equal(descriptor.inputSchema.properties.quote.maxLength, 4000);
});

test("IP pivot description uses neutral allocation and organization language", () => {
  const { toolset } = harness();
  const description = toolset.dynamicTools.ip.description;
  assert.match(description, /allocation/i);
  assert.match(description, /organization/i);
  assert.doesNotMatch(description, /ownership|geography/i);
});

test("a cancelled dynamic pivot cannot select or persist a record from a replaced case", async () => {
  const caseData = newCase("Cancelled tool pivot");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const registry = registryDouble();
  const selected = [];
  const candidateSets = [];
  let persists = 0;
  const toolset = createToolset({
    getCase: () => caseData,
    persist() { persists += 1; },
    registry,
    async archiveUrl() { return null; },
    async runEntityPivot() { return { cancelled: true, readings: [], candidates: [] }; },
    onSelect: (id) => selected.push(id),
    onCandidates: (id, candidates) => candidateSets.push([id, candidates]),
  });
  await toolset.registerStaticTools();
  await toolset.syncDynamicTools();

  const result = await registry.tools.get("pivot_domain").execute({ entity_id: "ent_1" });

  assert.equal(result.cancelled, true);
  assert.deepEqual(selected, []);
  assert.deepEqual(candidateSets, []);
  assert.equal(persists, 0);
});
