import { actorBadge, escapeHtml, formatTime, icon, safeLink, sectionHeader, typeBadge } from "./components.js";

function evidenceCard(caseData, evidence) {
  const entities = evidence.entity_ids.map((id) => caseData.entities.find((entity) => entity.id === id)).filter(Boolean);
  const archive = evidence.archived_url ? `<div class="archive-state archive-state--ok">${icon("check")}Archived copy confirmed ${safeLink(evidence.archived_url, "Open archive")}</div>` : '<div class="archive-state">No archived copy attached</div>';
  return `<article class="evidence-card card"><div class="card-body">
    <div class="evidence-card-head"><div>${safeLink(evidence.url, "Primary source")}<span class="captured-time">Captured ${escapeHtml(formatTime(evidence.captured_at))}</span></div>${actorBadge(evidence.added_by)}</div>
    <blockquote>${escapeHtml(evidence.quote)}</blockquote>
    <div class="evidence-entities">${entities.map((entity) => `<span>${typeBadge(entity.type)}<span class="selector">${escapeHtml(entity.value)}</span></span>`).join("") || '<span class="dim">No linked entities</span>'}</div>
    ${archive}
  </div></article>`;
}

export function renderEvidence({ caseData, draft = null }) {
  const selected = new Set(draft?.entity_ids ?? []);
  const options = caseData.entities.map((entity) => `<option value="${escapeHtml(entity.id)}"${selected.has(entity.id) ? " selected" : ""}>${escapeHtml(entity.type)} · ${escapeHtml(entity.value)}</option>`).join("");
  return `<div class="evidence-view">
    <header class="page-header"><div><span class="eyebrow">Source ledger</span><h1>Evidence</h1><p>Capture the exact text that supports a finding. Source, actor, entity, and time stay attached.</p></div></header>
    <form class="evidence-composer card" data-form="attach-evidence"><div class="card-body">
      <div class="evidence-form-grid"><div class="field"><label for="evidence-entity">Entities</label><select id="evidence-entity" name="entity_ids" multiple size="${Math.min(4, Math.max(2, caseData.entities.length))}">${options}</select></div><div class="field"><label for="evidence-url">Source URL</label><input id="evidence-url" class="mono" name="url" type="url" value="${escapeHtml(draft?.url ?? "")}" placeholder="https://…" required></div><div class="field field--quote"><label for="evidence-quote">Exact quote</label><textarea id="evidence-quote" name="quote" placeholder="Paste only the source text that supports the point" required>${escapeHtml(draft?.quote ?? "")}</textarea></div></div>
      <input type="hidden" name="reading_id" value="${escapeHtml(draft?.reading_id ?? "")}">
      <div class="composer-footer"><label class="checkbox"><input type="checkbox" name="archive"${draft?.archive ? " checked" : ""}><span>Request an archived copy</span></label><button class="button button--primary" type="submit">${icon("evidence")}Attach evidence</button></div>
      <div class="form-error" data-form-error hidden></div>
    </div></form>
    <section class="evidence-list">${sectionHeader("Captured evidence", caseData.evidence.length)}<div class="card-grid">${caseData.evidence.length ? caseData.evidence.map((evidence) => evidenceCard(caseData, evidence)).join("") : '<div class="quiet-empty card"><span>No evidence attached yet.</span><span class="dim">Open a reading and choose “Attach as evidence.”</span></div>'}</div></section>
  </div>`;
}
