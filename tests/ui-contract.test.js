import test from "node:test";
import assert from "node:assert/strict";
import { actorBadge, safeLink, statusBadge, typeBadge } from "../public/ui/components.js";
import { renderShell } from "../public/ui/shell.js";

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
