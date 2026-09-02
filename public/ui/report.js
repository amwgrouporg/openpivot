import { actorBadge, escapeHtml, formatTime, icon, safeLink, sectionHeader, statusBadge } from "./components.js";
import { reportSources } from "./view-models.js";

export function renderReport({ caseData }) {
  const sources = reportSources(caseData);
  return `<div class="report-view">
    <header class="page-header"><div><span class="eyebrow">Case synthesis</span><h1>Report</h1><p>Keep analyst judgment distinct from the agent draft, then export the complete provenanced ledger.</p></div><div class="page-actions"><label class="button button--ghost import-button">Import JSON<input type="file" accept="application/json,.json" data-action="import-json" hidden></label><button class="button button--ghost" type="button" data-action="export-json">Export JSON</button><button class="button button--primary" type="button" data-action="export-markdown">${icon("export")}Export Markdown</button></div></header>
    <div class="report-grid">
      <section class="report-editor card"><div class="card-body">${sectionHeader("Analyst conclusions")}<p class="section-intro">Only the human analyst can write this section.</p><textarea id="memo-human" placeholder="Write the conclusion, caveats, and remaining questions…" spellcheck="true">${escapeHtml(caseData.memo.human)}</textarea><div class="memo-state">Saved locally in this browser</div></div></section>
      <section class="agent-draft card" data-agent-report><div class="card-body"><div class="agent-draft-head"><div>${sectionHeader("Agent research draft")}</div>${actorBadge("agent")}</div><div class="draft-warning">${icon("warning")}<span><strong>Unreviewed agent draft.</strong> Check every point against its cited source before using it.</span></div><div class="agent-prose">${escapeHtml(caseData.memo.agent || "No agent draft yet. Ask the agent to use write_memo after reviewing the case sources.")}</div>${caseData.memo.agent_updated_at ? `<div class="memo-state">Updated ${escapeHtml(formatTime(caseData.memo.agent_updated_at))}</div>` : ""}</div></section>
    </div>
    <section class="report-sources">${sectionHeader("Source ledger", sources.length)}<div class="source-list">${sources.length ? sources.map((source) => `<article class="source-record"><div>${statusBadge(source.kind === "reading" ? "ok" : "accepted")}<p>${escapeHtml(source.label)}</p></div>${safeLink(source.url, "Open source")}</article>`).join("") : '<div class="quiet-empty card">No sources have been captured.</div>'}</div></section>
  </div>`;
}
