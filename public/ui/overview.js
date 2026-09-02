import { actorBadge, escapeHtml, formatTime, icon, sectionHeader, statusBadge, typeBadge } from "./components.js";

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

function queueCard(item) {
  if (item.kind === "relationship") {
    const record = item.record;
    return `<article class="queue-card queue-card--decision card" data-open-relationship="${escapeHtml(item.id)}">
      <div class="queue-accent"></div><div class="card-body">
        <div class="card-row"><span class="queue-kicker">Relationship awaiting review</span>${statusBadge("proposed")}</div>
        <div class="relationship-route"><span class="selector">${escapeHtml(record.from?.value)}</span>${icon("arrow")}<span class="selector">${escapeHtml(record.to?.value)}</span></div>
        <p>${escapeHtml(record.rationale)}</p>
        <button class="button button--small button--ghost" type="button" data-action="open-relationship" data-id="${escapeHtml(item.id)}">Review relationship</button>
      </div></article>`;
  }
  if (item.kind === "reading") {
    const record = item.record;
    return `<article class="queue-card card"><div class="card-body">
      <div class="card-row"><span class="queue-kicker">Sensor needs attention</span>${statusBadge(record.status)}</div>
      <strong class="selector">${escapeHtml(record.sensor)}</strong><p>${escapeHtml(record.summary)}</p>
      <button class="button button--small button--ghost" type="button" data-action="select-entity" data-id="${escapeHtml(record.entity_id)}">Inspect reading</button>
    </div></article>`;
  }
  if (item.kind === "candidate") {
    const record = item.record;
    return `<article class="queue-card card"><div class="card-body">
      <div class="card-row"><span class="queue-kicker">New candidate</span>${typeBadge(record.type)}</div>
      <strong class="selector">${escapeHtml(record.value)}</strong><p>${escapeHtml(record.why)}</p>
      <button class="button button--small button--ghost" type="button" data-action="select-entity" data-id="${escapeHtml(item.entity_id)}">Review candidate</button>
    </div></article>`;
  }
  return `<article class="queue-card card"><div class="card-body">
    <div class="card-row"><span class="queue-kicker">Pivot completed</span>${statusBadge(item.record.status)}</div>
    <p>Completed ${escapeHtml(formatTime(item.record.completed_at))}</p>
    <button class="button button--small button--ghost" type="button" data-action="select-entity" data-id="${escapeHtml(item.entity_id)}">Open entity</button>
  </div></article>`;
}

export function renderOverview({ caseData, queue, webmcpState }) {
  const toolCount = webmcpState?.toolNames?.length ?? 0;
  if (!caseData.entities.length) {
    return `<section class="empty-state">
      <div class="empty-symbol">${icon("entities")}</div>
      <span class="eyebrow">New investigation</span>
      <h1>Start with one selector</h1>
      <p>Add a domain, IP address, URL, organization, document, or claim. OpenPivot will keep every pivot, source, and human decision in one local ledger.</p>
      ${quickAdd()}
      <div class="empty-webmcp"><span class="connection-dot${webmcpState?.available ? " is-ready" : ""}"></span><strong>${toolCount} tools connected</strong><span>The agent can work on this same case through Site tools.</span></div>
    </section>`;
  }

  const groups = {
    relationship: queue.filter((item) => item.kind === "relationship"),
    reading: queue.filter((item) => item.kind === "reading"),
    candidate: queue.filter((item) => item.kind === "candidate"),
    run: queue.filter((item) => item.kind === "run"),
  };
  const decisions = groups.relationship.length + groups.reading.length + groups.candidate.length;
  return `<div class="overview-view">
    <header class="page-header"><div><span class="eyebrow">Investigation overview</span><h1>${decisions ? `${decisions} item${decisions === 1 ? "" : "s"} need your attention` : "Your ledger is up to date"}</h1><p>Review agent proposals, resolve uncertain readings, and decide which candidates deserve the next pivot.</p></div><div class="page-actions"><button class="button button--primary" type="button" data-view-action="entities">${icon("plus")}Add selector</button></div></header>
    <section class="metrics-grid" aria-label="Case summary">
      <div class="metric card"><span>Entities</span><strong>${caseData.entities.length}</strong><small>${caseData.entities.filter((item) => item.added_by === "agent").length} agent-added</small></div>
      <div class="metric card"><span>Review queue</span><strong class="${decisions ? "attention-text" : ""}">${decisions}</strong><small>${groups.relationship.length} relationships</small></div>
      <div class="metric card"><span>Evidence</span><strong>${caseData.evidence.length}</strong><small>${caseData.readings.length} readings captured</small></div>
      <div class="metric card"><span>Site tools</span><strong>${toolCount}</strong><small>${webmcpState?.available ? "WebMCP connected" : "Not available"}</small></div>
    </section>
    ${groups.relationship.length ? `<section class="queue-section">${sectionHeader("Needs review", groups.relationship.length)}<div class="queue-grid">${groups.relationship.map(queueCard).join("")}</div></section>` : ""}
    ${groups.reading.length ? `<section class="queue-section">${sectionHeader("Indeterminate readings", groups.reading.length)}<div class="queue-grid">${groups.reading.map(queueCard).join("")}</div></section>` : ""}
    ${groups.candidate.length ? `<section class="queue-section">${sectionHeader("Candidates to assess", groups.candidate.length)}<div class="queue-grid">${groups.candidate.map(queueCard).join("")}</div></section>` : ""}
    <section class="queue-section">${sectionHeader("Recent pivots", groups.run.length)}<div class="queue-grid">${groups.run.length ? groups.run.map(queueCard).join("") : `<div class="quiet-empty card"><span>No pivots recorded yet.</span><button class="button button--small button--ghost" type="button" data-view-action="entities">Open entities</button></div>`}</div></section>
    <section class="activity-strip"><span>${actorBadge("human")} owns review decisions</span><span>${actorBadge("agent")} proposes and researches</span><span class="tool-inline"><span class="connection-dot${webmcpState?.available ? " is-ready" : ""}"></span>${toolCount} tools connected</span></section>
  </div>`;
}
