import test from "node:test";
import assert from "node:assert/strict";
import { actorBadge, entityGlyph, safeLink, statusBadge, typeBadge } from "../public/ui/components.js";
import { renderShell } from "../public/ui/shell.js";
import { renderOverview } from "../public/ui/overview.js";
import { renderEntities } from "../public/ui/entities.js";
import { captureFormState, captureSearchReturnTarget, commandKeyAction, createCaseActions, focusReturnTarget, leadTriageFocusSelector, resetTransientUi, resolveFocusTarget, restoreFormState } from "../public/ui/events.js";
import { relationshipFocusFilter, renderRelationships } from "../public/ui/relationships.js";
import { renderEvidence } from "../public/ui/evidence.js";
import { renderReport } from "../public/ui/report.js";
import { renderSearchResults } from "../public/ui/search.js";
import { graphPreferenceUpdate, nextPathSelection, renderGraphControls, renderPathBreadcrumb } from "../public/ui/graph-controls.js";
import { newCase } from "../public/store.js";

test("safe links expose http destinations and neutralize executable protocols", () => {
  const safe = safeLink("https://example.com/source", "Example source");
  assert.match(safe, /href="https:\/\/example\.com\/source"/);
  assert.match(safe, /rel="noopener noreferrer"/);
  assert.match(safe, />Example source</);

  const unsafe = safeLink("javascript:alert(1)", "Unsafe");
  assert.doesNotMatch(unsafe, /<a/);
  assert.match(unsafe, />Unsafe</);
});

test("badges always include readable status, actor, and entity text", () => {
  assert.match(statusBadge("indeterminate"), />Collection inconclusive</);
  assert.match(actorBadge("agent"), />agent</);
  assert.match(actorBadge("human"), />investigator</);
  assert.match(typeBadge("domain"), />domain</);
});

test("graph entity glyphs are inline and type-specific", () => {
  assert.match(entityGlyph("domain"), /node-glyph/);
  assert.doesNotMatch(entityGlyph("domain"), /(?:href|src)=/);
  assert.notEqual(entityGlyph("domain"), entityGlyph("ip"));
});

test("shell exposes five destinations and identifies the active view", () => {
  const html = renderShell({
    caseData: { title: "Example case", entities: [], links: [], evidence: [], readings: [] },
    activeView: "overview",
    counts: { overview: 2, entities: 0, relationships: 1, evidence: 0, report: 0 },
    webmcpState: { available: true, toolNames: Array.from({ length: 10 }, (_, index) => `tool_${index}`) },
    contentHtml: "<p>Review queue</p>",
    workbenchHtml: "<p>Selected record</p>",
  });

  for (const view of ["overview", "entities", "relationships", "evidence", "report"]) {
    assert.match(html, new RegExp(`data-view-action="${view}"`));
  }
  for (const label of ["Case overview", "Entities", "Relationships", "Evidence", "Findings"]) {
    assert.match(html, new RegExp(`aria-label="${label}"`));
  }
  assert.match(html, /data-view-action="overview"[^>]*aria-current="page"/);
  assert.match(html, /data-main-surface/);
  assert.match(html, /data-workbench/);
  assert.match(html, /data-live-status[^>]*aria-live="polite"/);
  assert.match(html, /10 collection tools available/);
});

test("shell contains dedicated modal and toast hosts outside main content", () => {
  const html = renderShell({
    caseData: { title: "Case", entities: [], links: [], evidence: [], readings: [] },
    activeView: "entities",
    counts: {},
    webmcpState: { available: false, toolNames: [] },
    contentHtml: "",
    workbenchHtml: "",
  });

  assert.match(html, /data-modal-host/);
  assert.match(html, /data-toast-host/);
  assert.match(html, /Collection tools unavailable/);
});

test("command key opens search and Escape closes it", () => {
  assert.equal(commandKeyAction({ key: "k", metaKey: true }, { searchOpen: false }), "open-search");
  assert.equal(commandKeyAction({ key: "k", ctrlKey: true }, { searchOpen: false }), "open-search");
  assert.equal(commandKeyAction({ key: "Escape" }, { searchOpen: true }), "close-search");
  assert.equal(commandKeyAction({ key: "k", metaKey: true }, { searchOpen: false, modalOpen: true }), null);
});

test("search focus identity restores exact repeated and attributed controls", () => {
  const element = (tagName, attributes = {}) => ({
    tagName: tagName.toUpperCase(),
    id: attributes.id ?? "",
    getAttribute(name) { return attributes[name] ?? null; },
  });
  const firstEntity = element("button", { "data-action": "select-entity", "data-id": "ent_1" });
  const secondEntity = element("button", { "data-action": "select-entity", "data-id": "ent_2" });
  const lead = element("input", { type: "checkbox", "data-lead-key": "ent_2:domain:next.example" });
  const firstSource = element("a", { href: "https://example.com/source" });
  const secondSource = element("a", { href: "https://example.com/source" });
  const root = {
    querySelectorAll(selector) {
      if (selector.includes('data-id="ent_2"')) return [secondEntity];
      if (selector.includes("data-lead-key")) return [lead];
      if (selector.startsWith("a[href=")) return [firstSource, secondSource];
      return [firstEntity, secondEntity, lead, firstSource, secondSource];
    },
  };

  const entityTarget = focusReturnTarget(secondEntity, root);
  const leadTarget = focusReturnTarget(lead, root);
  const sourceTarget = focusReturnTarget(secondSource, root);

  assert.match(entityTarget.selector, /data-action="select-entity".*data-id="ent_2"/);
  assert.equal(resolveFocusTarget(root, entityTarget), secondEntity);
  assert.match(leadTarget.selector, /data-lead-key="ent_2:domain:next\.example"/);
  assert.equal(resolveFocusTarget(root, leadTarget), lead);
  assert.match(sourceTarget.selector, /^a\[href=/);
  assert.equal(sourceTarget.index, 1);
  assert.equal(resolveFocusTarget(root, sourceTarget), secondSource);
});

test("repeated search shortcut preserves the original focus return target", () => {
  const original = { selector: '.entity-row[data-id="ent_2"]', index: 0 };
  const search = { tagName: "INPUT", id: "case-search", getAttribute() { return null; } };
  const root = { querySelectorAll() { return [search]; } };

  assert.equal(captureSearchReturnTarget(original, search, root), original);
});

test("shell exposes local-search shortcut and visual-system hooks", () => {
  const html = renderShell({
    caseData: { title: "Case", entities: [], links: [], evidence: [], readings: [], log: [] },
    activeView: "overview",
    counts: {},
    webmcpState: { available: true, toolNames: [] },
    contentHtml: '<section class="view-enter">Case overview</section>',
  });

  assert.match(html, /Search this case/);
  assert.match(html, /⌘K|Ctrl K/);
  assert.match(html, /app-depth-field[^>]*aria-hidden="true"/);
  assert.match(html, /workspace-frame/);
});

test("overview makes human decisions more prominent than completed activity", () => {
  const caseData = newCase("Queue");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const html = renderOverview({
    caseData,
    queue: [
      { kind: "relationship", id: "lnk_1", entity_id: "ent_1", record: { rationale: "DNS A record", from: { value: "example.com" }, to: { value: "192.0.2.1" } } },
      { kind: "run", id: "run_1", entity_id: "ent_1", record: { status: "ok", completed_at: "2026-09-01T10:00:00.000Z" } },
    ],
    webmcpState: { available: true, toolNames: Array.from({ length: 10 }, (_, index) => `tool_${index}`) },
  });

  assert.ok(html.indexOf("Relationships pending review") < html.indexOf("Recent collection activity"));
  assert.match(html, /DNS A record/);
  assert.match(html, /10 collection tools available/);
  assert.match(html, /Review priorities/);
  assert.match(html, /data-form="case-brief"/);
});

test("empty overview provides one guided entity starting point", () => {
  const caseData = newCase("Empty");
  const html = renderOverview({ caseData, queue: [], webmcpState: { available: true, toolNames: Array(10).fill("tool") } });
  assert.match(html, /Start with one selector/);
  assert.match(html, /id="entity-quick-add"/);
  assert.match(html, /data-form="case-brief"/);
  assert.match(html, /name="type"/);
  assert.match(html, /name="value"/);
});

test("graph controls expose every analyst mode", () => {
  const html = renderGraphControls({
    preferences: { graph_layout: "force", graph_hops: "all", graph_activity_window: "all", graph_labels: "auto" },
    selectedId: "a", pathMode: false, path: null, density: { message: "" },
  });
  for (const label of ["Relationship map", "Entity lanes", "Radial focus", "All entities", "1 hop", "2 hops", "Case activity", "Trace path", "Fit selection", "Graph legend"]) {
    assert.match(html, new RegExp(label));
  }
  const withoutSelection = renderGraphControls({ preferences: { graph_hops: 1 }, selectedId: null, pathMode: false, path: null, density: { message: "" } });
  assert.match(withoutSelection, /data-value="radial"[^>]*disabled/);
  assert.match(withoutSelection, /data-graph-action="fit-selection"[^>]*disabled/);
  assert.match(withoutSelection, /data-graph-preference="graph_hops" data-value="all" aria-pressed="true"/);
  assert.match(withoutSelection, /data-graph-preference="graph_hops" data-value="1" aria-pressed="false"[^>]*disabled/);
  assert.equal(renderPathBreadcrumb(null, null), '<p class="graph-path-empty" role="status">No path is present in the current graph filters.</p>');
});

test("path breadcrumb names entities and relationship types", () => {
  const caseData = newCase("Path breadcrumb");
  caseData.entities = [
    { id: "a", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-03T10:00:00.000Z" },
    { id: "b", type: "ip", value: "192.0.2.1", notes: "", added_by: "human", added_at: "2026-09-03T10:00:00.000Z" },
  ];
  caseData.links = [{ id: "ab", from: "a", to: "b", relationship_type: "resolves_to", rationale: "", asserted_by: "human", status: "accepted", at: "2026-09-03T10:00:00.000Z", citations: [] }];

  const html = renderPathBreadcrumb(caseData, { nodeIds: ["a", "b"], linkIds: ["ab"] });

  assert.match(html, /example\.com.*resolves to.*192\.0\.2\.1/);
  assert.match(html, /<button[^>]*data-action="path-open-entity"[^>]*data-id="a"[^>]*>example\.com<\/button>/);
  assert.match(html, /<button[^>]*data-action="path-open-relationship"[^>]*data-id="ab"[^>]*>resolves to<\/button>/);
  assert.match(html, /Clear path/);
});

test("clear graph filters resets only filtering state and returns a stable focus target", async () => {
  const { clearGraphFilters } = await import("../public/ui/graph-controls.js");
  assert.equal(typeof clearGraphFilters, "function");
  const caseData = newCase("Clear filters");
  caseData.ui.graph_layout = "lanes";
  caseData.ui.graph_labels = "focus";
  caseData.ui.graph_hops = 2;
  caseData.ui.graph_activity_window = "24h";
  const graphFilters = { status: "rejected", types: ["ip"] };

  const focusTarget = clearGraphFilters(caseData, graphFilters);

  assert.deepEqual(graphFilters, { status: "active", types: [] });
  assert.equal(caseData.ui.graph_hops, "all");
  assert.equal(caseData.ui.graph_activity_window, "all");
  assert.equal(caseData.ui.graph_layout, "lanes");
  assert.equal(caseData.ui.graph_labels, "focus");
  assert.equal(focusTarget, '[data-control="graph-status-filter"]');
});

test("graph preference updates only one valid field", () => {
  const caseData = newCase("Graph preferences");
  const positions = { ...caseData.ui.graph_positions };

  graphPreferenceUpdate(caseData, "graph_layout", "lanes");

  assert.equal(caseData.ui.graph_layout, "lanes");
  assert.deepEqual(caseData.ui.graph_positions, positions);
  assert.throws(() => graphPreferenceUpdate(caseData, "graph_layout", "3d"), /invalid graph preference/);
});

test("path selection chooses start then end without mutating case data", () => {
  const caseData = newCase("Path selection");
  caseData.links = [
    { id: "ab", from: "a", to: "b" },
    { id: "bc", from: "b", to: "c" },
  ];
  const before = JSON.stringify(caseData);

  const first = nextPathSelection({ pathStartId: null, pathEndId: null }, "a", caseData.links);
  const second = nextPathSelection(first, "c", caseData.links);

  assert.equal(first.pathStartId, "a");
  assert.deepEqual(second.path.nodeIds, ["a", "b", "c"]);
  assert.equal(JSON.stringify(caseData), before);
});

test("entity workbench shows sensor progress and keeps unrelated navigation available", () => {
  const caseData = newCase("Entity");
  const selected = { id: "ent_1", type: "domain", value: "example.com", notes: "Seed", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" };
  caseData.entities.push(selected);
  const activeRun = { entity_id: "ent_1", status: "running", sensors: [{ name: "dns", status: "running" }, { name: "rdap", status: "queued" }] };
  const rendered = renderEntities({ caseData, selected, candidates: [{ type: "domain", value: "www.example.com", why: "certificate", source_reading_id: null }], activeRun });

  assert.match(rendered.contentHtml, /id="graph"/);
  assert.match(rendered.contentHtml, /Investigation graph/);
  assert.match(rendered.contentHtml, /data-control="graph-status-filter"/);
  assert.match(rendered.contentHtml, /data-graph-type="domain"/);
  assert.doesNotMatch(rendered.contentHtml, /data-graph-connected/);
  assert.match(rendered.contentHtml, /data-graph-semantic/);
  assert.match(rendered.contentHtml, /class="graph-minimap"[^>]*aria-hidden="true"/);
  assert.match(rendered.contentHtml, /data-graph-hover-status[^>]*role="status"/);
  assert.match(rendered.contentHtml, /data-graph-unavailable[^>]*hidden[^>]*>Interactive graph unavailable; use the graph text alternative below\./);
  assert.match(rendered.contentHtml, /data-graph-semantic[\s\S]*data-action="graph-select-entity"/);
  assert.match(rendered.contentHtml, /graph-control-deck/);
  assert.match(rendered.contentHtml, /data-graph-preference="graph_layout"/);
  assert.match(rendered.contentHtml, /<svg id="graph"[^>]*role="group"/);
  assert.match(rendered.contentHtml, /<details class="graph-semantic" data-graph-semantic/);
  assert.doesNotMatch(rendered.contentHtml, /class="sr-only" data-graph-semantic/);
  assert.match(rendered.workbenchHtml, /example\.com/);
  assert.match(rendered.workbenchHtml, /data-workbench-title[^>]*tabindex="-1"/);
  assert.match(rendered.workbenchHtml, /data-candidate-key="ent_1:domain:www\.example\.com"/);
  assert.match(rendered.workbenchHtml, /dns/);
  assert.match(rendered.workbenchHtml, /Collection in progress/);
  assert.match(rendered.workbenchHtml, /data-action="run-pivot"[^>]*disabled/);
  assert.doesNotMatch(rendered.contentHtml, /disabled[^>]*data-view-action/);
});

test("empty graph results explain active filters and expose a clear action", () => {
  const caseData = newCase("No graph results");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-03T10:00:00Z" });

  const html = renderEntities({ caseData, selected: caseData.entities[0], graphFilters: { status: "accepted", types: ["claim"] } }).contentHtml;

  assert.match(html, /No entities match the current filters/);
  assert.match(html, /Active filters:[\s\S]*Accepted into case[\s\S]*claim/i);
  assert.match(html, /data-graph-action="clear-filters"[^>]*>Clear graph filters<\/button>/);
});

test("graph text alternative names both relationship endpoints and path membership", () => {
  const caseData = newCase("Graph alternative");
  caseData.entities = [
    { id: "a", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-03T10:00:00Z" },
    { id: "b", type: "ip", value: "192.0.2.1", notes: "", added_by: "agent", added_at: "2026-09-03T10:01:00Z" },
  ];
  caseData.links = [{
    id: "ab", from: "a", to: "b", relationship_type: "resolves_to", rationale: "Observed DNS answer",
    asserted_by: "agent", status: "accepted", at: "2026-09-03T10:02:00Z", citations: [],
  }];

  const html = renderEntities({ caseData, selected: caseData.entities[0], pathState: { path: { nodeIds: ["a", "b"], linkIds: ["ab"] } } }).contentHtml;

  assert.match(html, /data-graph-semantic[\s\S]*directional relationship from example\.com to 192\.0\.2\.1/);
  assert.match(html, /data-graph-semantic[\s\S]*included in traced path/);
});

test("entity workbench exposes persistent restoration for dismissed candidates", () => {
  const caseData = newCase("Dismissed");
  const selected = { id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" };
  caseData.entities.push(selected);
  const candidate = { type: "domain", value: "www.example.com", why: "certificate", source_reading_id: "rdg_1" };
  const rendered = renderEntities({ caseData, selected, candidates: [], dismissedCandidates: [candidate], activeRun: null });

  assert.match(rendered.workbenchHtml, /Dismissed leads/);
  assert.match(rendered.workbenchHtml, /www\.example\.com/);
  assert.match(rendered.workbenchHtml, /data-action="restore-candidate"/);
});

test("add-and-propose candidate never bypasses human review", () => {
  const caseData = newCase("Candidate");
  caseData.entities.push({ id: "ent_domain", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const actions = createCaseActions({
    getCase: () => caseData,
    persist() {},
    setUi() {},
    runEntityPivot: async () => ({ readings: [], candidates: [] }),
  });

  const entity = actions.addAndProposeCandidate("ent_domain", { type: "ip", value: "192.0.2.1", why: "DNS A record", source_reading_id: null });

  assert.equal(entity.value, "192.0.2.1");
  assert.equal(caseData.links.length, 1);
  assert.equal(caseData.links[0].status, "proposed");
  assert.equal(caseData.links[0].asserted_by, "human");
});

test("proposed relationship card exposes rationale, citation, and both review choices", () => {
  const caseData = newCase("Review");
  caseData.entities = [
    { id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" },
    { id: "ent_2", type: "ip", value: "192.0.2.1", notes: "", added_by: "agent", added_at: "2026-09-01T10:01:00.000Z" },
  ];
  caseData.readings = [{ id: "rdg_1", entity_id: "ent_1", sensor: "dns", status: "ok", summary: "A 192.0.2.1", source_url: "https://cloudflare-dns.com/dns-query?name=example.com", fetched_at: "2026-09-01T10:02:00.000Z", requested_by: "agent", raw: {}, untrusted: true }];
  caseData.links = [{ id: "lnk_1", from: "ent_1", to: "ent_2", relationship_type: "resolves_to", rationale: "DNS A record", asserted_by: "agent", status: "proposed", at: "2026-09-01T10:03:00.000Z", citations: [{ kind: "reading", id: "rdg_1" }] }];

  const html = renderRelationships({ caseData, statusFilter: "all" });

  assert.match(html, /DNS A record/);
  assert.match(html, /resolves to/);
  assert.match(html, /cloudflare-dns\.com/);
  assert.match(html, /data-action="accept-relationship"/);
  assert.match(html, /data-action="reject-relationship"/);
});

test("symmetric relationship cards use a bidirectional cue in graph and overview surfaces", () => {
  const caseData = newCase("Symmetric relationship");
  caseData.entities = [
    { id: "ent_1", type: "domain", value: "one.example", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" },
    { id: "ent_2", type: "domain", value: "two.example", notes: "", added_by: "human", added_at: "2026-09-01T10:01:00.000Z" },
  ];
  caseData.links = [{ id: "lnk_1", from: "ent_1", to: "ent_2", relationship_type: "associated_with", rationale: "Same source", asserted_by: "agent", status: "proposed", at: "2026-09-01T10:03:00.000Z", citations: [] }];
  const record = { ...caseData.links[0], from: caseData.entities[0], to: caseData.entities[1] };

  const relationshipHtml = renderRelationships({ caseData });
  const overviewHtml = renderOverview({ caseData, queue: [{ kind: "relationship", id: "lnk_1", entity_id: "ent_1", record }], webmcpState: { available: true, toolNames: [] } });

  for (const html of [relationshipHtml, overviewHtml]) {
    assert.match(html, /data-relationship-cue="symmetric"[^>]*aria-label="Symmetric relationship"[^>]*>↔<\/span>/);
    assert.doesNotMatch(html, /icon-arrow/);
  }
});

test("graph legend is complete and open for desktop rendering", () => {
  const html = renderGraphControls({ preferences: { graph_hops: "all" }, selectedId: "a", desktop: true });

  assert.match(html, /<details class="graph-legend" open>/);
  for (const phrase of ["Domain", "IP address", "Agent-added", "Retrieved", "Collection inconclusive", "Accepted into case", "Pending analyst review", "Rejected by analyst", "Traced path", "Evidence count"]) {
    assert.match(html, new RegExp(phrase));
  }
});

test("default graph relationship filter is labelled accepted plus pending", () => {
  const caseData = newCase("Precise filters");
  const html = renderEntities({ caseData, selected: null }).contentHtml;
  assert.match(html, /<option value="active" selected>Accepted \+ pending<\/option>/);
  assert.doesNotMatch(html, />In case<\/option>/);
});

test("focus-dependent controls fall back truthfully when filters hide the selected entity", () => {
  const caseData = newCase("Hidden focus");
  caseData.entities = [
    { id: "domain", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-03T10:00:00Z" },
    { id: "ip", type: "ip", value: "192.0.2.1", notes: "", added_by: "human", added_at: "2026-09-03T10:00:00Z" },
  ];
  caseData.ui.graph_layout = "radial";
  caseData.ui.graph_hops = 2;

  const html = renderEntities({ caseData, selected: caseData.entities[1], graphFilters: { status: "active", types: ["domain"] } }).contentHtml;

  assert.match(html, /data-value="force" aria-pressed="true"/);
  assert.match(html, /data-value="radial" aria-pressed="false" disabled/);
  assert.match(html, /data-graph-preference="graph_hops" data-value="all" aria-pressed="true"/);
  assert.match(html, /data-graph-preference="graph_hops" data-value="2" aria-pressed="false" disabled/);
  assert.match(html, /data-graph-count>1 entities · 0 relationships/);
});

test("relationship focus changes to a filter containing the resulting status", () => {
  assert.equal(relationshipFocusFilter("proposed", "accepted"), "all");
  assert.equal(relationshipFocusFilter("accepted", "accepted"), "accepted");
  assert.equal(relationshipFocusFilter("all", "rejected"), "all");
});

test("evidence draft prefills provenance while leaving the exact quote empty", () => {
  const caseData = newCase("Evidence");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const html = renderEvidence({ caseData, draft: { reading_id: "rdg_1", entity_ids: ["ent_1"], url: "https://example.com/source", quote: "", archive: false } });

  assert.match(html, /value="https:\/\/example\.com\/source"/);
  assert.match(html, /name="quote"[^>]*><\/textarea>/);
  assert.match(html, /name="quote"[^>]*maxlength="4000"/);
  assert.match(html, /value="ent_1" selected/);
});

test("evidence renders submitted archive state and an explicit untrusted label", () => {
  const caseData = newCase("Archive state");
  caseData.evidence.push({ id: "evd_1", entity_ids: [], url: "https://example.com/source", quote: "Quoted source text", relevance: "Supports the observed DNS relationship", captured_at: "2026-09-01T10:00:00.000Z", archived_url: null, archive_status: "pending", archive_check_url: "https://web.archive.org/web/*/https://example.com/source", added_by: "agent", untrusted: true, reading_id: null });

  const html = renderEvidence({ caseData, draft: null });

  assert.match(html, /Archive request submitted; capture not confirmed/);
  assert.match(html, /web\.archive\.org/);
  assert.match(html, /Source excerpt — untrusted external content/);
  assert.match(html, /Supports the observed DNS relationship/);
});

test("report keeps analyst editing separate from the agent draft and sources", () => {
  const caseData = newCase("Report");
  caseData.memo.agent = "Agent finding";
  caseData.readings.push({ id: "rdg_1", entity_id: "ent_1", sensor: "dns", status: "ok", summary: "A 192.0.2.1", source_url: "https://example.com/source", fetched_at: "2026-09-01T10:00:00.000Z", requested_by: "agent", raw: {}, untrusted: true });

  const html = renderReport({ caseData });

  assert.match(html, /id="memo-human"/);
  assert.match(html, /Agent draft — requires validation/);
  assert.match(html, /Agent finding/);
  assert.match(html, /Outstanding questions and collection gaps/);
  assert.match(html, /Methodology and handling notes/);
  assert.match(html, /example\.com\/source/);
  assert.match(html, /<button[^>]*data-action="import-json-trigger"[^>]*>Import case JSON<\/button>/);
  assert.match(html, /<input[^>]*type="file"[^>]*data-action="import-json"[^>]*hidden/);
});

test("findings renders each collection source with its actual collection status", () => {
  const caseData = newCase("Source status");
  caseData.readings.push({ id: "rdg_1", entity_id: "ent_1", sensor: "archive", status: "indeterminate", summary: "request sent; confirmation pending", source_url: "https://web.archive.org/save/example.com", fetched_at: "2026-09-01T10:00:00.000Z", requested_by: "agent", raw: {}, untrusted: true });

  const html = renderReport({ caseData });

  assert.match(html, /Collection inconclusive/);
  assert.doesNotMatch(html, /Retrieved/);
});

test("case search renders typed local results", () => {
  const html = renderSearchResults("example", [{ kind: "entity", id: "ent_1", title: "example.com", context: "domain", view: "entities", entity_id: "ent_1" }]);
  assert.match(html, /Case search results/);
  assert.match(html, /data-action="search-result"/);
  assert.match(html, /example\.com/);
  assert.match(html, /data-view="entities"/);
});

test("primary cyber investigation views avoid unsupported verification claims", () => {
  const caseData = newCase("Language check");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const rendered = [
    renderOverview({ caseData, queue: [], webmcpState: { available: true, toolNames: [] } }),
    renderEntities({ caseData, selected: caseData.entities[0], candidates: [], activeRun: null }).contentHtml,
    renderRelationships({ caseData }),
    renderEvidence({ caseData }),
    renderReport({ caseData }),
  ].join(" ");
  assert.doesNotMatch(rendered, /\b(?:verified|trusted|proven|confidence|attributed)\b|confirmed relationship/i);
});

test("primary renderers expose view entrance and investigation surface hooks", () => {
  const caseData = newCase("Visual system");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const rendered = [
    renderOverview({ caseData, queue: [], webmcpState: { available: true, toolNames: [] } }),
    renderEntities({ caseData, selected: caseData.entities[0], candidates: [], activeRun: null }).contentHtml,
    renderRelationships({ caseData }),
    renderEvidence({ caseData }),
    renderReport({ caseData }),
  ];

  for (const html of rendered) assert.match(html, /class="[^"]*view-enter/);
  assert.match(rendered[0], /metric-surface/);
  assert.match(rendered[1], /entity-surface/);
  assert.match(rendered[2], /relationship-surface/);
  assert.match(rendered[3], /evidence-surface/);
  assert.match(rendered[4], /findings-surface/);
  assert.match(rendered[4], /source-surface/);
});

test("graph disclosure and path updates preserve accessible semantics", () => {
  const controls = renderGraphControls({ preferences: {}, selectedId: null, pathMode: true, pathStartId: "ent_1", path: null, density: { message: "" } });
  assert.match(controls, /<details[^>]*class="graph-legend"[^>]*open/);
  assert.match(controls, /graph-path-(?:instructions|empty)[^>]*(?:aria-live="polite"|role="status")/);
});

test("semantic graph records have explicit Enter and Space activation", async () => {
  const { explicitButtonKeyAction } = await import("../public/ui/events.js");
  assert.equal(typeof explicitButtonKeyAction, "function");
  const target = { closest: (selector) => selector.includes("data-graph-semantic") ? { click() {} } : null };
  assert.equal(explicitButtonKeyAction({ key: "Enter", target }), "activate");
  assert.equal(explicitButtonKeyAction({ key: " ", target }), "activate");
  assert.equal(explicitButtonKeyAction({ key: "Escape", target }), null);
});

test("the visible import button has explicit keyboard activation", async () => {
  const { explicitButtonKeyAction } = await import("../public/ui/events.js");
  const target = { closest: (selector) => selector.includes("import-json-trigger") ? { click() {} } : null };
  assert.equal(explicitButtonKeyAction({ key: "Enter", target }), "activate");
  assert.equal(explicitButtonKeyAction({ key: " ", target }), "activate");
});

test("case actions attach evidence and save only the analyst memo", () => {
  const caseData = newCase("Actions");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  caseData.readings.push({ id: "rdg_1", entity_id: "ent_1", sensor: "rdap", status: "ok", summary: "registered", source_url: "https://example.com/rdap", fetched_at: "2026-09-01T10:00:00.000Z", requested_by: "agent", raw: {}, untrusted: true });
  const actions = createCaseActions({ getCase: () => caseData, persist() {}, setUi() {}, runEntityPivot: async () => ({}) });

  actions.attachEvidence({ entity_ids: ["ent_1"], url: "https://example.com/rdap", quote: "registration 1995-08-14", reading_id: "rdg_1", archived_url: null });
  actions.saveAnalystMemo("Analyst conclusion");

  assert.equal(caseData.evidence.length, 1);
  assert.equal(caseData.evidence[0].reading_id, "rdg_1");
  assert.equal(caseData.memo.human, "Analyst conclusion");
  assert.equal(caseData.memo.agent, "");
});

test("case actions save investigation framing and structured findings", () => {
  const caseData = newCase("Framing");
  const actions = createCaseActions({ getCase: () => caseData, persist() {}, setUi() {}, runEntityPivot: async () => ({}) });

  actions.saveCaseBrief({ objective: "Identify infrastructure used by the campaign", scope: "Domains observed during the incident window", status: "active" });
  actions.saveFindingsField("gaps", "Historical hosting data is incomplete");
  actions.saveFindingsField("methodology", "DNS, RDAP, CT, URL scan and archive collection");

  assert.equal(caseData.brief.objective, "Identify infrastructure used by the campaign");
  assert.equal(caseData.memo.gaps, "Historical hosting data is incomplete");
  assert.equal(caseData.memo.methodology, "DNS, RDAP, CT, URL scan and archive collection");
});

test("batch lead actions add or dismiss without asserting relationships", () => {
  const caseData = newCase("Batch leads");
  caseData.entities.push({ id: "ent_parent", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const actions = createCaseActions({ getCase: () => caseData, persist() {}, setUi() {}, runEntityPivot: async () => ({}) });
  const leads = [
    { parentId: "ent_parent", candidate: { type: "domain", value: "www.example.com", why: "certificate", source_reading_id: null }, key: "ent_parent:domain:www.example.com" },
    { parentId: "ent_parent", candidate: { type: "ip", value: "192.0.2.9", why: "A record", source_reading_id: null }, key: "ent_parent:ip:192.0.2.9" },
  ];

  actions.addSelectedLeads(leads);
  assert.equal(caseData.entities.length, 3);
  assert.equal(caseData.links.length, 0);

  actions.dismissSelectedLeads(leads);
  assert.deepEqual(caseData.ui.dismissed_candidates.sort(), leads.map((lead) => lead.key).sort());
});

test("network-organization lead defaults to a neutral association", () => {
  const caseData = newCase("Network association");
  caseData.entities.push({ id: "ent_ip", type: "ip", value: "192.0.2.1", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const actions = createCaseActions({ getCase: () => caseData, persist() {}, setUi() {}, runEntityPivot: async () => ({}) });

  actions.addAndProposeCandidate("ent_ip", { type: "org", value: "Example Network", why: "network organization", source_reading_id: null });

  assert.equal(caseData.links[0].relationship_type, "associated_with");
});

test("batch triage focus falls back to the review heading when no leads remain", () => {
  const rootWithLeads = { querySelector: (selector) => selector === ".lead-triage-toolbar" ? {} : null };
  const rootWithoutLeads = { querySelector: () => null };

  assert.equal(leadTriageFocusSelector(rootWithLeads), ".lead-triage-toolbar");
  assert.equal(leadTriageFocusSelector(rootWithoutLeads), ".main-surface h1");
});

test("a later mutation invalidates entity-removal undo", () => {
  const caseData = newCase("Undo revision");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const actions = createCaseActions({ getCase: () => caseData, persist() {}, setUi() {}, runEntityPivot: async () => ({}) });

  actions.removeEntity("ent_1");
  actions.addEntity({ type: "domain", value: "openai.com", notes: "" });

  assert.throws(() => actions.undoRemoval(), /nothing to undo/i);
});

test("entity notes editing records analyst context", () => {
  const caseData = newCase("Notes");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const actions = createCaseActions({ getCase: () => caseData, persist() {}, setUi() {}, runEntityPivot: async () => ({}) });

  actions.editEntityNotes("ent_1", "Primary domain under review");

  assert.equal(caseData.entities[0].notes, "Primary domain under review");
  assert.equal(caseData.log[0].action, "edit_entity_notes");
});

test("form state capture and restore preserves unsaved values and focus selection", () => {
  const controls = [
    { id: "source-url", name: "url", type: "url", value: "https://example.com", checked: false, selectionStart: 8, selectionEnd: 15 },
    { id: "archive", name: "archive", type: "checkbox", value: "on", checked: true, selectionStart: null, selectionEnd: null },
  ];
  const root = {
    querySelectorAll: () => controls,
    ownerDocument: { activeElement: controls[0] },
    querySelector: (selector) => controls.find((control) => selector.includes(control.id)) ?? null,
  };
  controls[0].focus = () => { root.ownerDocument.activeElement = controls[0]; };
  controls[0].setSelectionRange = (start, end) => { controls[0].selectionStart = start; controls[0].selectionEnd = end; };
  const state = captureFormState(root);
  controls[0].value = "";
  controls[0].selectionStart = 0;
  controls[0].selectionEnd = 0;
  controls[1].checked = false;

  restoreFormState(root, state);

  assert.equal(controls[0].value, "https://example.com");
  assert.equal(controls[1].checked, true);
  assert.equal(root.ownerDocument.activeElement, controls[0]);
  assert.deepEqual([controls[0].selectionStart, controls[0].selectionEnd], [8, 15]);
});

test("case replacement clears transient UI and disables old undo", () => {
  let caseData = newCase("Before import");
  caseData.entities.push({ id: "ent_old", type: "domain", value: "old.example", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const actions = createCaseActions({ getCase: () => caseData, persist() {}, setUi() {}, runEntityPivot: async () => ({}) });
  actions.removeEntity("ent_old");
  const ui = { selected: "ent_old", activeRun: {}, evidenceDraft: {}, toast: { undo: true }, modal: {}, returnFocus: "button", focusRelationship: "lnk_1", skipFormRestore: false, pathMode: true, pathStartId: "ent_old", pathEndId: "ent_new", path: { nodeIds: ["ent_old", "ent_new"], linkIds: ["lnk_1"] }, graphFilters: { status: "rejected", types: ["ip"] } };

  actions.invalidateUndo();
  caseData = newCase("Imported");
  resetTransientUi(ui);

  assert.throws(() => actions.undoRemoval(), /nothing to undo/i);
  assert.deepEqual(ui, { selected: null, activeRun: null, evidenceDraft: null, toast: null, modal: null, returnFocus: null, focusRelationship: null, skipFormRestore: true, pathMode: false, pathStartId: null, pathEndId: null, path: null, graphFilters: { status: "active", types: [] } });
});
