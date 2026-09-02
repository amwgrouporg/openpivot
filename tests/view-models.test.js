import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewQueue,
  candidateKey,
  dismissedCandidates,
  evidenceDraftFromReading,
  groupInvestigativeLeads,
  relationshipView,
  reportSources,
  searchCase,
  visibleCandidates,
} from "../public/ui/view-models.js";
import { addEvidence, addLink, exportMarkdown, newCase } from "../public/store.js";

function fixtureCase() {
  const caseData = newCase("Fixture");
  caseData.entities = [
    { id: "ent_domain", type: "domain", value: "example.com", notes: "", added_by: "human", added_at: "2026-09-01T10:00:00.000Z" },
    { id: "ent_ip", type: "ip", value: "192.0.2.1", notes: "", added_by: "agent", added_at: "2026-09-01T10:01:00.000Z" },
  ];
  caseData.readings = [
    { id: "rdg_dns", entity_id: "ent_domain", sensor: "dns", status: "ok", summary: "A 192.0.2.1", source_url: "https://cloudflare-dns.com/dns-query?name=example.com", fetched_at: "2026-09-01T10:02:00.000Z", requested_by: "agent", raw: { records: { A: [{ value: "192.0.2.1" }] } }, untrusted: true },
    { id: "rdg_archive", entity_id: "ent_domain", sensor: "archive", status: "indeterminate", summary: "request sent; confirmation pending", source_url: "https://web.archive.org/save/example.com", fetched_at: "2026-09-01T10:03:00.000Z", requested_by: "human", raw: { submitted: true }, untrusted: true },
  ];
  caseData.links = [{ id: "lnk_1", from: "ent_domain", to: "ent_ip", rationale: "DNS A record", asserted_by: "agent", status: "proposed", at: "2026-09-01T10:04:00.000Z", citations: [{ kind: "reading", id: "rdg_dns" }] }];
  caseData.runs = [{ id: "run_1", entity_id: "ent_domain", requested_by: "agent", started_at: "2026-09-01T10:01:30.000Z", completed_at: "2026-09-01T10:03:00.000Z", status: "indeterminate", sensors: [] }];
  return caseData;
}

const candidateMap = new Map([["ent_domain", [{ type: "ip", value: "198.51.100.8", why: "A record", source_reading_id: "rdg_dns" }]]]);

test("review queue prioritizes proposals, indeterminate readings, candidates, then runs", () => {
  const queue = buildReviewQueue(fixtureCase(), candidateMap);
  assert.deepEqual(queue.map((item) => item.kind), ["relationship", "reading", "candidate", "run"]);
});

test("dismissed candidates are hidden without changing the candidate input", () => {
  const caseData = fixtureCase();
  const candidate = candidateMap.get("ent_domain")[0];
  caseData.ui.dismissed_candidates = [candidateKey("ent_domain", candidate)];

  assert.deepEqual(visibleCandidates(caseData, candidateMap, "ent_domain"), []);
  assert.equal(candidateMap.get("ent_domain").length, 1);
});

test("dismissed candidates remain available for persistent restoration", () => {
  const caseData = fixtureCase();
  const candidate = candidateMap.get("ent_domain")[0];
  caseData.ui.dismissed_candidates = [candidateKey("ent_domain", candidate)];

  assert.deepEqual(dismissedCandidates(caseData, candidateMap, "ent_domain"), [candidate]);
});

test("relationship view resolves cited reading provenance", () => {
  const caseData = fixtureCase();
  const view = relationshipView(caseData, caseData.links[0]);

  assert.equal(view.from.value, "example.com");
  assert.equal(view.to.value, "192.0.2.1");
  assert.equal(view.citations[0].sensor, "dns");
  assert.equal(view.citations[0].source_url, "https://cloudflare-dns.com/dns-query?name=example.com");
});

test("missing citations remain explicit instead of crashing the review", () => {
  const caseData = fixtureCase();
  caseData.links[0].citations = [{ kind: "evidence", id: "evd_missing" }];

  assert.deepEqual(relationshipView(caseData, caseData.links[0]).citations, [{ kind: "evidence", id: "evd_missing", missing: true }]);
});

test("evidence draft from a reading prefills provenance but requires a quote", () => {
  const caseData = fixtureCase();
  assert.deepEqual(evidenceDraftFromReading(caseData, "rdg_dns"), {
    reading_id: "rdg_dns",
    entity_ids: ["ent_domain"],
    url: "https://cloudflare-dns.com/dns-query?name=example.com",
    quote: "",
    relevance: "",
    archive: false,
  });
});

test("report sources deduplicate cited reading and evidence URLs", () => {
  const caseData = fixtureCase();
  caseData.evidence = [{ id: "evd_1", entity_ids: ["ent_domain"], url: "https://cloudflare-dns.com/dns-query?name=example.com", quote: "A 192.0.2.1", captured_at: "2026-09-01T10:05:00.000Z", archived_url: null, added_by: "human", untrusted: true, reading_id: "rdg_dns" }];

  assert.deepEqual(reportSources(caseData).map((source) => source.url), [
    "https://cloudflare-dns.com/dns-query?name=example.com",
    "https://web.archive.org/save/example.com",
  ]);
});

test("link and evidence operations accept citation references and export them", () => {
  const caseData = fixtureCase();
  caseData.links = [];
  addEvidence(caseData, { entity_ids: ["ent_domain"], url: "https://example.com/source", quote: "Example quote", relevance: "Supports DNS resolution", reading_id: "rdg_dns" }, "human");
  const evidenceId = caseData.evidence[0].id;
  addLink(caseData, { from: "ent_domain", to: "ent_ip", relationship_type: "resolves_to", rationale: "Supported relationship", citations: [{ kind: "reading", id: "rdg_dns" }, { kind: "evidence", id: evidenceId }] }, "agent");

  assert.deepEqual(caseData.links[0].citations, [{ kind: "reading", id: "rdg_dns" }, { kind: "evidence", id: evidenceId }]);
  assert.equal(caseData.evidence[0].reading_id, "rdg_dns");
  const markdown = exportMarkdown(caseData);
  assert.match(markdown, /Citations:/);
  assert.match(markdown, /cloudflare-dns\.com/);
  assert.match(markdown, /example\.com\/source/);
  assert.match(markdown, /resolves to/);
  assert.match(markdown, /Supports DNS resolution/);
});

test("evidence requires a nonblank exact quote", () => {
  const caseData = fixtureCase();
  assert.throws(() => addEvidence(caseData, { entity_ids: ["ent_domain"], url: "https://example.com/source", quote: "   " }, "agent"), /quote/i);
});

test("markdown export renders untrusted fields literally", () => {
  const caseData = fixtureCase();
  caseData.entities[0].notes = "<script>alert(1)</script> *not emphasis*";
  caseData.links[0].rationale = "[click](javascript:alert(1))";
  caseData.readings[0].summary = "<img src=x onerror=alert(1)>";
  caseData.evidence = [{ id: "evd_1", entity_ids: ["ent_domain"], url: "https://example.com/source", quote: "# heading\n<script>alert(1)</script>", captured_at: "2026-09-01T10:00:00.000Z", archived_url: null, added_by: "agent", untrusted: true, reading_id: null }];

  const markdown = exportMarkdown(caseData);

  assert.doesNotMatch(markdown, /<img /);
  assert.doesNotMatch(markdown, /\[click\]\(javascript:/);
  assert.match(markdown, /\\\*not emphasis\\\*/);
  assert.match(markdown, /```+text\n# heading\n<script>alert\(1\)<\/script>\n```+/);
});

test("investigative leads are grouped by parent entity and collection method", () => {
  const caseData = fixtureCase();
  const groups = groupInvestigativeLeads(caseData, candidateMap);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].parent.value, "example.com");
  assert.equal(groups[0].method, "DNS");
  assert.equal(groups[0].leads[0].source_reading_id, "rdg_dns");
});

test("local case search returns typed results across investigation fields", () => {
  const caseData = fixtureCase();
  caseData.brief.objective = "Determine infrastructure ownership";
  caseData.memo.gaps = "Need hosting history";
  caseData.evidence.push({ id: "evd_1", entity_ids: ["ent_domain"], url: "https://example.com/source", quote: "Registration record", relevance: "Supports ownership", captured_at: "2026-09-01T10:00:00.000Z", archived_url: null, archive_status: "not_requested", archive_check_url: null, added_by: "human", untrusted: true, reading_id: null });

  assert.equal(searchCase(caseData, "ownership")[0].kind, "case");
  assert.equal(searchCase(caseData, "hosting history")[0].view, "report");
  assert.equal(searchCase(caseData, "registration record")[0].kind, "evidence");
  assert.equal(searchCase(caseData, "EXAMPLE.COM").some((result) => result.kind === "entity"), true);
  assert.deepEqual(searchCase(caseData, "  "), []);
});
