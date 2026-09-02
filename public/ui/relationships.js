import { actorBadge, escapeHtml, formatTime, icon, safeLink, sectionHeader, statusBadge, typeBadge } from "./components.js";
import { relationshipView } from "./view-models.js";

export function relationshipFocusFilter(currentFilter, resultingStatus) {
  return currentFilter === "all" || currentFilter === resultingStatus ? currentFilter : "all";
}

function citationCard(citation) {
  if (citation.missing) return `<div class="citation citation--missing">Missing ${escapeHtml(citation.kind)}: <span class="mono">${escapeHtml(citation.id)}</span></div>`;
  const source = citation.kind === "reading" ? citation.source_url : citation.url;
  const title = citation.kind === "reading" ? `${citation.sensor}: ${citation.summary}` : citation.quote;
  return `<div class="citation"><div><span class="eyebrow">${escapeHtml(citation.kind)} citation</span><p>${escapeHtml(title)}</p></div>${safeLink(source, "Open source")}</div>`;
}

function relationshipCard(caseData, relationship) {
  const view = relationshipView(caseData, relationship);
  return `<article class="relationship-card card" data-relationship-id="${escapeHtml(view.id)}" tabindex="-1"><div class="relationship-status-line relationship-status-line--${escapeHtml(view.status)}"></div><div class="card-body">
    <div class="relationship-card-head"><div class="relationship-route"><span>${typeBadge(view.from.type)}<strong class="selector">${escapeHtml(view.from.value)}</strong></span>${icon("arrow")}<span>${typeBadge(view.to.type)}<strong class="selector">${escapeHtml(view.to.value)}</strong></span></div>${statusBadge(view.status)}</div>
    <div class="rationale"><span class="eyebrow">Rationale</span><p>${escapeHtml(view.rationale)}</p></div>
    ${view.citations.length ? `<div class="citation-list">${view.citations.map(citationCard).join("")}</div>` : '<p class="uncited-note">No direct citation attached. Review the rationale carefully.</p>'}
    <div class="relationship-card-foot"><div class="meta-row">${actorBadge(view.asserted_by)}<span>Proposed ${escapeHtml(formatTime(view.at))}</span>${view.reviewed_by ? `<span>Reviewed by ${escapeHtml(view.reviewed_by)}</span>` : ""}</div>${view.status === "proposed" ? `<div class="review-actions"><button class="button button--danger" type="button" data-action="reject-relationship" data-id="${escapeHtml(view.id)}">Reject</button><button class="button button--primary" type="button" data-action="accept-relationship" data-id="${escapeHtml(view.id)}">${icon("check")}Accept relationship</button></div>` : ""}</div>
  </div></article>`;
}

export function renderRelationships({ caseData, statusFilter = "all" }) {
  const filtered = statusFilter === "all" ? caseData.links : caseData.links.filter((link) => link.status === statusFilter);
  const pending = caseData.links.filter((link) => link.status === "proposed").length;
  const options = caseData.entities.map((entity) => `<option value="${escapeHtml(entity.id)}">${escapeHtml(entity.type)} · ${escapeHtml(entity.value)}</option>`).join("");
  return `<div class="relationships-view">
    <header class="page-header"><div><span class="eyebrow">Human review</span><h1>${pending ? `${pending} relationship${pending === 1 ? "" : "s"} await a verdict` : "Relationships"}</h1><p>Every connection keeps its rationale, proposing actor, review state, and cited source records.</p></div><div class="page-actions"><label class="filter-control"><span>Status</span><select data-control="relationship-filter"><option value="all"${statusFilter === "all" ? " selected" : ""}>All</option><option value="proposed"${statusFilter === "proposed" ? " selected" : ""}>Proposed</option><option value="accepted"${statusFilter === "accepted" ? " selected" : ""}>Accepted</option><option value="rejected"${statusFilter === "rejected" ? " selected" : ""}>Rejected</option></select></label></div></header>
    <form class="relationship-composer card" data-form="add-relationship"><div class="card-body"><div class="composer-grid"><div class="field"><label for="link-from">From</label><select id="link-from" name="from" required><option value="">Choose entity</option>${options}</select></div><div class="field"><label for="link-to">To</label><select id="link-to" name="to" required><option value="">Choose entity</option>${options}</select></div><div class="field field--wide"><label for="link-rationale">Rationale</label><input id="link-rationale" name="rationale" type="text" placeholder="Explain what connects these records" required></div><button class="button button--primary" type="submit">Propose relationship</button></div><div class="form-error" data-form-error hidden></div></div></form>
    <section class="relationship-list">${sectionHeader("Case relationships", filtered.length)}<div class="card-stack">${filtered.length ? filtered.map((link) => relationshipCard(caseData, link)).join("") : '<div class="quiet-empty card"><span>No relationships match this filter.</span><button class="button button--small button--ghost" type="button" data-view-action="entities">Open entities</button></div>'}</div></section>
  </div>`;
}
