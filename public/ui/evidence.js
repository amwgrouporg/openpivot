import { actorBadge, escapeHtml, formatTime, icon, safeLink, sectionHeader, typeBadge } from "./components.js";

function evidenceCard(caseData, evidence) {
  const entities = evidence.entity_ids.map((id) => caseData.entities.find((entity) => entity.id === id)).filter(Boolean);
  const archive = evidence.archived_url
    ? `<div class="archive-state archive-state--ok">${icon("check")}Archive capture available ${safeLink(evidence.archived_url, "Open archive")}</div>`
    : evidence.archive_status === "pending"
      ? `<div class="archive-state archive-state--pending">${icon("warning")}Archive request submitted; capture not confirmed ${safeLink(evidence.archive_check_url, "Check archive")}</div>`
      : '<div class="archive-state">Archive not requested</div>';
  return `<article class="evidence-card evidence-surface card" data-evidence-id="${escapeHtml(evidence.id)}" tabindex="-1"><div class="card-body">
    <div class="evidence-card-head"><div>${safeLink(evidence.url, "Primary source")}<span class="captured-time">Captured ${escapeHtml(formatTime(evidence.captured_at))}</span></div>${actorBadge(evidence.added_by)}</div>
    <div class="untrusted evidence-quote"><div class="untrusted-label">${icon("warning")}Source excerpt — untrusted external content</div><blockquote>${escapeHtml(evidence.quote)}</blockquote></div>
    ${evidence.relevance ? `<div class="evidence-relevance"><span class="eyebrow">Relevance to investigation</span><p>${escapeHtml(evidence.relevance)}</p></div>` : ""}
    <div class="evidence-entities">${entities.map((entity) => `<span>${typeBadge(entity.type)}<span class="selector">${escapeHtml(entity.value)}</span></span>`).join("") || '<span class="dim">No linked entities</span>'}</div>
    ${archive}
  </div></article>`;
}

export function renderEvidence({ caseData, draft = null }) {
  const selected = new Set(draft?.entity_ids ?? []);
  const options = caseData.entities.map((entity) => `<option value="${escapeHtml(entity.id)}"${selected.has(entity.id) ? " selected" : ""}>${escapeHtml(entity.type)} · ${escapeHtml(entity.value)}</option>`).join("");
  return `<div class="evidence-view view-enter">
    <header class="page-header"><div><span class="eyebrow">Evidence register</span><h1>Source excerpts</h1><p>Preserve exact external source text separately from the investigator or agent note explaining its relevance.</p></div></header>
    <form class="evidence-composer evidence-surface card" data-form="attach-evidence"><div class="card-body">
      <div class="evidence-form-grid"><div class="field"><label for="evidence-entity">Related entities</label><select id="evidence-entity" name="entity_ids" multiple size="${Math.min(4, Math.max(2, caseData.entities.length))}">${options}</select></div><div class="field"><label for="evidence-url">Source URL</label><input id="evidence-url" class="mono" name="url" type="url" value="${escapeHtml(draft?.url ?? "")}" placeholder="https://…" required></div><div class="field field--quote"><label for="evidence-quote">Source excerpt</label><textarea id="evidence-quote" name="quote" placeholder="Paste the exact external source text" required>${escapeHtml(draft?.quote ?? "")}</textarea></div><div class="field field--quote"><label for="evidence-relevance">Relevance to investigation</label><textarea id="evidence-relevance" name="relevance" placeholder="Explain what this excerpt supports, contradicts, or leaves unresolved">${escapeHtml(draft?.relevance ?? "")}</textarea></div></div>
      <input type="hidden" name="reading_id" value="${escapeHtml(draft?.reading_id ?? "")}">
      <div class="composer-footer"><label class="checkbox"><input type="checkbox" name="archive"${draft?.archive ? " checked" : ""}><span>Request an archive capture</span></label><button class="button button--primary" type="submit">${icon("evidence")}Add to evidence register</button></div>
      <div class="form-error" data-form-error hidden></div>
    </div></form>
    <section class="evidence-list">${sectionHeader("Evidence register", caseData.evidence.length)}<div class="card-grid">${caseData.evidence.length ? caseData.evidence.map((evidence) => evidenceCard(caseData, evidence)).join("") : '<div class="quiet-empty empty-surface evidence-surface card"><span>No source excerpts registered.</span><span class="dim">Open a collection result and choose “Add to evidence register.”</span></div>'}</div></section>
  </div>`;
}
