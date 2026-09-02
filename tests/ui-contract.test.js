import test from "node:test";
import assert from "node:assert/strict";
import { actorBadge, safeLink, statusBadge, typeBadge } from "../public/ui/components.js";
import { renderShell } from "../public/ui/shell.js";
import { renderOverview } from "../public/ui/overview.js";
import { renderEntities } from "../public/ui/entities.js";
import { createCaseActions } from "../public/ui/events.js";
import { renderRelationships } from "../public/ui/relationships.js";
import { renderEvidence } from "../public/ui/evidence.js";
import { renderReport } from "../public/ui/report.js";
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
  assert.match(statusBadge("indeterminate"), />indeterminate</);
  assert.match(actorBadge("agent"), />agent</);
  assert.match(typeBadge("domain"), />domain</);
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
  for (const label of ["Overview", "Entities", "Relationships", "Evidence", "Report"]) {
    assert.match(html, new RegExp(`aria-label="${label}"`));
  }
  assert.match(html, /data-view-action="overview"[^>]*aria-current="page"/);
  assert.match(html, /data-main-surface/);
  assert.match(html, /data-workbench/);
  assert.match(html, /data-live-status[^>]*aria-live="polite"/);
  assert.match(html, /10 site tools ready/);
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
  assert.match(html, /Site tools unavailable/);
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

  assert.ok(html.indexOf("Needs review") < html.indexOf("Recent pivots"));
  assert.match(html, /DNS A record/);
  assert.match(html, /10 tools connected/);
});

test("empty overview provides one guided entity starting point", () => {
  const caseData = newCase("Empty");
  const html = renderOverview({ caseData, queue: [], webmcpState: { available: true, toolNames: Array(10).fill("tool") } });
  assert.match(html, /Start with one selector/);
  assert.match(html, /id="entity-quick-add"/);
  assert.match(html, /name="type"/);
  assert.match(html, /name="value"/);
});

test("entity workbench shows sensor progress and keeps unrelated navigation available", () => {
  const caseData = newCase("Entity");
  const selected = { id: "ent_1", type: "domain", value: "example.com", notes: "Seed", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" };
  caseData.entities.push(selected);
  const activeRun = { entity_id: "ent_1", status: "running", sensors: [{ name: "dns", status: "running" }, { name: "rdap", status: "queued" }] };
  const rendered = renderEntities({ caseData, selected, candidates: [], activeRun });

  assert.match(rendered.contentHtml, /id="graph"/);
  assert.match(rendered.workbenchHtml, /example\.com/);
  assert.match(rendered.workbenchHtml, /dns/);
  assert.match(rendered.workbenchHtml, /running/);
  assert.match(rendered.workbenchHtml, /data-action="run-pivot"[^>]*disabled/);
  assert.doesNotMatch(rendered.contentHtml, /disabled[^>]*data-view-action/);
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
  caseData.links = [{ id: "lnk_1", from: "ent_1", to: "ent_2", rationale: "DNS A record", asserted_by: "agent", status: "proposed", at: "2026-09-01T10:03:00.000Z", citations: [{ kind: "reading", id: "rdg_1" }] }];

  const html = renderRelationships({ caseData, statusFilter: "all" });

  assert.match(html, /DNS A record/);
  assert.match(html, /cloudflare-dns\.com/);
  assert.match(html, /data-action="accept-relationship"/);
  assert.match(html, /data-action="reject-relationship"/);
});

test("evidence draft prefills provenance while leaving the exact quote empty", () => {
  const caseData = newCase("Evidence");
  caseData.entities.push({ id: "ent_1", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" });
  const html = renderEvidence({ caseData, draft: { reading_id: "rdg_1", entity_ids: ["ent_1"], url: "https://example.com/source", quote: "", archive: false } });

  assert.match(html, /value="https:\/\/example\.com\/source"/);
  assert.match(html, /name="quote"[^>]*><\/textarea>/);
  assert.match(html, /value="ent_1" selected/);
});

test("report keeps analyst editing separate from the agent draft and sources", () => {
  const caseData = newCase("Report");
  caseData.memo.agent = "Agent finding";
  caseData.readings.push({ id: "rdg_1", entity_id: "ent_1", sensor: "dns", status: "ok", summary: "A 192.0.2.1", source_url: "https://example.com/source", fetched_at: "2026-09-01T10:00:00.000Z", requested_by: "agent", raw: {}, untrusted: true });

  const html = renderReport({ caseData });

  assert.match(html, /id="memo-human"/);
  assert.match(html, /Unreviewed agent draft/);
  assert.match(html, /Agent finding/);
  assert.match(html, /example\.com\/source/);
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
