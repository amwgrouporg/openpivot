import { actorBadge, escapeHtml, formatTime, icon, sectionHeader, statusBadge, typeBadge } from "./components.js";
import { candidateKey } from "./view-models.js";
import { relationshipPresentation } from "../graph-model.js";

function quickAdd() {
  return `<form id="entity-quick-add" class="quick-add" data-form="add-entity">
    <div class="form-row">
      <div class="field"><label for="quick-type">Selector type</label><select id="quick-type" name="type"><option value="domain">Domain</option><option value="ip">IP address</option><option value="url">URL</option><option value="org">Organization</option><option value="document">Document</option><option value="claim">Claim</option></select></div>
      <div class="field"><label for="quick-value">Selector</label><input id="quick-value" class="mono" name="value" type="text" placeholder="example.com" required spellcheck="false"></div>
      <button class="button button--primary" type="submit">${icon("plus")}<span>Add to case</span></button>
    </div>
    <div class="form-error" data-form-error hidden></div>
  </form>`;
}

function caseBriefForm(caseData, compact = false) {
  return `<form class="case-brief card${compact ? " case-brief--compact" : ""}" data-form="case-brief"><div class="card-body"><div class="case-brief-head"><div><span class="eyebrow">Investigation definition</span><h2>Objective and scope</h2></div><label class="filter-control"><span>Case status</span><select name="status"><option value="active"${caseData.brief.status === "active" ? " selected" : ""}>Active</option><option value="on_hold"${caseData.brief.status === "on_hold" ? " selected" : ""}>On hold</option><option value="closed"${caseData.brief.status === "closed" ? " selected" : ""}>Closed</option></select></label></div><div class="case-brief-grid"><div class="field"><label for="case-objective">Investigation objective</label><textarea id="case-objective" name="objective" placeholder="What technical question should this investigation answer?">${escapeHtml(caseData.brief.objective)}</textarea></div><div class="field"><label for="case-scope">Scope and constraints</label><textarea id="case-scope" name="scope" placeholder="Incident window, included infrastructure, exclusions, or handling constraints">${escapeHtml(caseData.brief.scope)}</textarea></div></div><div class="composer-footer"><span class="dim">Last updated ${escapeHtml(formatTime(caseData.brief.updated_at))}</span><button class="button button--small button--ghost" type="submit">Save investigation definition</button></div></div></form>`;
}

function queueCard(item) {
  if (item.kind === "relationship") {
    const record = item.record;
    const presentation = relationshipPresentation(record);
    return `<article class="queue-card queue-surface queue-card--decision card" data-open-relationship="${escapeHtml(item.id)}">
      <div class="queue-accent"></div><div class="card-body">
        <div class="card-row"><span class="queue-kicker">Relationship pending review</span>${statusBadge("proposed")}</div>
        <div class="relationship-route"><span class="selector">${escapeHtml(record.from?.value)}</span><span class="relationship-cue" data-relationship-cue="${presentation.cueKind}" aria-label="${presentation.cueLabel}">${presentation.cue}</span><span class="selector">${escapeHtml(record.to?.value)}</span></div>
        <p>${escapeHtml(record.rationale)}</p>
        <button class="button button--small button--ghost" type="button" data-action="open-relationship" data-id="${escapeHtml(item.id)}">Open review</button>
      </div></article>`;
  }
  if (item.kind === "reading") {
    const record = item.record;
    return `<article class="queue-card queue-surface card"><div class="card-body">
      <div class="card-row"><span class="queue-kicker">Collection requires follow-up</span>${statusBadge(record.status)}</div>
      <strong class="selector">${escapeHtml(record.sensor)}</strong><p>${escapeHtml(record.summary)}</p>
      <button class="button button--small button--ghost" type="button" data-action="select-entity" data-id="${escapeHtml(record.entity_id)}">Inspect collection result</button>
    </div></article>`;
  }
  if (item.kind === "candidate") {
    const record = item.record;
    return `<article class="queue-card queue-surface card"><div class="card-body">
      <div class="card-row"><span class="queue-kicker">Untriaged investigative lead</span>${typeBadge(record.type)}</div>
      <strong class="selector">${escapeHtml(record.value)}</strong><p>${escapeHtml(record.why)}</p>
      <button class="button button--small button--ghost" type="button" data-action="select-entity" data-id="${escapeHtml(item.entity_id)}">Triage lead</button>
    </div></article>`;
  }
  return `<article class="queue-card queue-surface card"><div class="card-body">
    <div class="card-row"><span class="queue-kicker">Collection completed</span>${statusBadge(item.record.status)}</div>
    <p>Completed ${escapeHtml(formatTime(item.record.completed_at))}</p>
    <button class="button button--small button--ghost" type="button" data-action="select-entity" data-id="${escapeHtml(item.entity_id)}">Open entity</button>
  </div></article>`;
}

function leadGroupsView(groups, selectedKeys) {
  const selectedCount = selectedKeys.size;
  return `<div class="lead-triage-toolbar"><span>${selectedCount ? `${selectedCount} selected` : "Select leads for batch triage"}</span><div><button class="button button--small button--ghost" type="button" data-action="batch-dismiss-leads"${selectedCount ? "" : " disabled"}>Dismiss selected</button><button class="button button--small button--primary" type="button" data-action="batch-add-leads"${selectedCount ? "" : " disabled"}>Add selected</button></div></div><div class="lead-groups">${groups.map((group) => `<section class="lead-group card"><div class="card-body"><div class="lead-group-head"><div><span class="eyebrow">Discovered via ${escapeHtml(group.method)}</span><h3>${escapeHtml(group.parent.value)}</h3></div>${typeBadge(group.parent.type)}</div><div class="lead-list">${group.leads.map((lead) => { const key = candidateKey(group.parent.id, lead); const encoded = escapeHtml(JSON.stringify(lead)); return `<label class="lead-row"><input type="checkbox" data-lead-key="${escapeHtml(key)}" data-parent="${escapeHtml(group.parent.id)}" data-candidate="${encoded}"${selectedKeys.has(key) ? " checked" : ""}><span>${typeBadge(lead.type)}<strong class="selector">${escapeHtml(lead.value)}</strong><small>${escapeHtml(lead.why)}</small></span></label>`; }).join("")}</div></div></section>`).join("")}</div>`;
}

export function renderOverview({ caseData, queue, webmcpState, leadGroups = [], selectedLeadKeys = new Set() }) {
  const toolCount = webmcpState?.toolNames?.length ?? 0;
  if (!caseData.entities.length) {
    return `<section class="empty-state empty-surface view-enter">
      <div class="empty-symbol">${icon("entities")}</div>
      <span class="eyebrow">New cyber investigation</span>
      <h1>Start with one selector</h1>
      <p>Add a domain, IP address, URL, organization, document, or claim. OpenPivot records each collection result, source, technical relationship, and analyst decision in the local case.</p>
      ${caseBriefForm(caseData, true)}
      ${quickAdd()}
      <div class="empty-webmcp"><span class="connection-dot${webmcpState?.available ? " is-ready" : ""}"></span><strong>${toolCount} collection tools available</strong><span>The agent can work on this same case through Site tools.</span></div>
    </section>`;
  }

  const groups = {
    relationship: queue.filter((item) => item.kind === "relationship"),
    reading: queue.filter((item) => item.kind === "reading"),
    candidate: queue.filter((item) => item.kind === "candidate"),
    run: queue.filter((item) => item.kind === "run"),
  };
  const decisions = groups.relationship.length + groups.reading.length + groups.candidate.length;
  return `<div class="overview-view view-enter">
    <header class="page-header"><div><span class="eyebrow">Case status</span><h1>${decisions ? "Review priorities" : "No outstanding review items"}</h1><p>${decisions ? `${groups.relationship.length} relationships pending review · ${groups.reading.length} inconclusive collection results · ${groups.candidate.length} untriaged leads` : "No relationships, collection results, or investigative leads currently require analyst action."}</p></div><div class="page-actions"><button class="button button--primary" type="button" data-view-action="entities">${icon("plus")}Add entity</button></div></header>
    ${caseBriefForm(caseData)}
    <section class="metrics-grid" aria-label="Case summary">
      <div class="metric metric-surface card"><span>Entities</span><strong>${caseData.entities.length}</strong><small>${caseData.entities.filter((item) => item.added_by === "agent").length} agent-added</small></div>
      <div class="metric metric-surface card"><span>Review priorities</span><strong class="${decisions ? "attention-text" : ""}">${decisions}</strong><small>${groups.relationship.length} relationships · ${groups.reading.length} inconclusive</small></div>
      <div class="metric metric-surface card"><span>Evidence register</span><strong>${caseData.evidence.length}</strong><small>${caseData.readings.length} collection results</small></div>
      <div class="metric metric-surface card"><span>Collection tools</span><strong>${toolCount}</strong><small>${webmcpState?.available ? "Available to the agent" : "Not available"}</small></div>
    </section>
    ${groups.relationship.length ? `<section class="queue-section">${sectionHeader("Relationships pending review", groups.relationship.length)}<div class="queue-grid">${groups.relationship.map(queueCard).join("")}</div></section>` : ""}
    ${groups.reading.length ? `<section class="queue-section">${sectionHeader("Collection inconclusive", groups.reading.length)}<div class="queue-grid">${groups.reading.map(queueCard).join("")}</div></section>` : ""}
    ${groups.candidate.length ? `<section class="queue-section">${sectionHeader("Untriaged investigative leads", groups.candidate.length)}${leadGroups.length ? leadGroupsView(leadGroups, selectedLeadKeys) : `<div class="queue-grid">${groups.candidate.map(queueCard).join("")}</div>`}</section>` : ""}
    <section class="queue-section">${sectionHeader("Recent collection activity", groups.run.length)}<div class="queue-grid">${groups.run.length ? groups.run.map(queueCard).join("") : `<div class="quiet-empty empty-surface card"><span>No collection runs recorded yet.</span><button class="button button--small button--ghost" type="button" data-view-action="entities">Open entities</button></div>`}</div></section>
    <section class="activity-strip"><span>${actorBadge("human")} investigator owns case decisions</span><span>${actorBadge("agent")} runs collection and drafts findings</span><span class="tool-inline"><span class="connection-dot${webmcpState?.available ? " is-ready" : ""}"></span>${toolCount} collection tools available</span></section>
  </div>`;
}
