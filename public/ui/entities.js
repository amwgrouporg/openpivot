import { actorBadge, escapeHtml, formatTime, icon, safeLink, sectionHeader, shorten, statusBadge, typeBadge } from "./components.js";
import { graphListModel } from "../graph.js";
import { candidateKey } from "./view-models.js";

const ENTITY_TYPES = ["domain", "ip", "url", "org", "document", "claim"];
const PIVOT_LABELS = {
  domain: "Run domain pivot",
  ip: "Run IP pivot",
  url: "Run URL pivot",
};

function addEntityForm() {
  return `<form class="entity-add card" data-form="add-entity"><div class="card-body form-row">
    <div class="field"><label for="entity-type">Type</label><select id="entity-type" name="type">${ENTITY_TYPES.map((type) => `<option value="${type}">${type}</option>`).join("")}</select></div>
    <div class="field"><label for="entity-value">Selector</label><input id="entity-value" class="mono" name="value" type="text" placeholder="example.com" required spellcheck="false"><input name="notes" type="text" placeholder="Why this matters (optional)"></div>
    <button class="button button--primary" type="submit">${icon("plus")}Add</button>
    <div class="form-error" data-form-error hidden></div>
  </div></form>`;
}

function entityList(caseData, selected) {
  return `<div class="entity-list" aria-label="Case entities">${caseData.entities.map((entity) => `<button class="entity-row${selected?.id === entity.id ? " is-selected" : ""}" type="button" data-action="select-entity" data-id="${escapeHtml(entity.id)}">
    ${typeBadge(entity.type)}<span class="selector">${escapeHtml(entity.value)}</span>${actorBadge(entity.added_by)}
  </button>`).join("") || '<div class="quiet-empty">No entities yet.</div>'}</div>`;
}

function runPanel(activeRun) {
  if (!activeRun) return "";
  return `<section class="workbench-section run-panel">${sectionHeader("Current pivot", activeRun.sensors.length)}<div class="sensor-grid">${activeRun.sensors.map((sensor) => `<div class="sensor-state"><span class="mono">${escapeHtml(sensor.name)}</span>${statusBadge(sensor.status)}</div>`).join("")}</div></section>`;
}

function readingCard(reading) {
  const extracted = reading.sensor === "extract" && reading.raw?.text ? `<div class="untrusted"><div class="untrusted-label">${icon("warning")}Untrusted source material</div><pre>${escapeHtml(shorten(reading.raw.text, 1600))}</pre></div>` : "";
  return `<article class="reading-card card"><div class="card-body">
    <div class="card-row"><strong class="mono">${escapeHtml(reading.sensor)}</strong>${statusBadge(reading.status)}<span class="spacer"></span>${actorBadge(reading.requested_by)}</div>
    <p>${escapeHtml(reading.summary)}</p>${extracted}
    <div class="reading-footer">${safeLink(reading.source_url, "Open source")}<span>${escapeHtml(formatTime(reading.fetched_at))}</span>${reading.source_url ? `<button class="button button--small button--ghost" type="button" data-action="evidence-from-reading" data-id="${escapeHtml(reading.id)}">Attach as evidence</button>` : ""}</div>
  </div></article>`;
}

function candidateCard(candidate, selectedId) {
  const encoded = escapeHtml(JSON.stringify(candidate));
  return `<article class="candidate-card card"><div class="card-body">
    <div class="card-row">${typeBadge(candidate.type)}<strong class="selector">${escapeHtml(candidate.value)}</strong></div>
    <p>${escapeHtml(candidate.why)}</p>
    <div class="candidate-actions"><button class="button button--small" type="button" data-action="add-candidate" data-parent="${escapeHtml(selectedId)}" data-candidate="${encoded}">Add</button><button class="button button--small button--primary" type="button" data-action="add-propose-candidate" data-parent="${escapeHtml(selectedId)}" data-candidate="${encoded}">Add + propose link</button><button class="button button--small button--quiet" type="button" data-action="dismiss-candidate" data-parent="${escapeHtml(selectedId)}" data-candidate="${encoded}">Dismiss</button></div>
  </div></article>`;
}

function dismissedCandidateCard(candidate, selectedId) {
  const key = candidateKey(selectedId, candidate);
  return `<article class="dismissed-candidate"><span>${typeBadge(candidate.type)}<span class="selector">${escapeHtml(candidate.value)}</span></span><button class="button button--small button--ghost" type="button" data-action="restore-candidate" data-key="${escapeHtml(key)}">Restore</button></article>`;
}

function workbench({ caseData, selected, candidates, dismissedCandidates: dismissed = [], activeRun }) {
  if (!selected) return "";
  const readings = caseData.readings.filter((reading) => reading.entity_id === selected.id);
  const canPivot = Boolean(PIVOT_LABELS[selected.type]);
  const isRunning = activeRun?.entity_id === selected.id && activeRun.completed_at == null;
  return `<div class="workbench-head"><div><span class="eyebrow">Selected entity</span><h2 data-workbench-title tabindex="-1">${escapeHtml(selected.value)}</h2></div><button class="button button--quiet icon-button" type="button" data-action="close-workbench" aria-label="Close workbench">${icon("close")}</button></div>
    <div class="meta-row">${typeBadge(selected.type)}${actorBadge(selected.added_by)}<span>${escapeHtml(formatTime(selected.added_at))}</span></div>
    <form class="entity-notes" data-form="edit-notes"><input type="hidden" name="entity_id" value="${escapeHtml(selected.id)}"><div class="field"><label for="entity-notes">Analyst context</label><textarea id="entity-notes" name="notes" placeholder="Why this entity matters">${escapeHtml(selected.notes)}</textarea></div><button class="button button--small button--ghost" type="submit">Save notes</button></form>
    ${canPivot ? `<div class="pivot-actions"><button class="button button--primary" type="button" data-action="run-pivot" data-id="${escapeHtml(selected.id)}"${isRunning ? " disabled" : ""}>${icon("search")}<span>${isRunning ? "Pivot running" : PIVOT_LABELS[selected.type]}</span></button>${selected.type === "url" ? `<button class="button button--ghost" type="button" data-action="run-pivot-archive" data-id="${escapeHtml(selected.id)}"${isRunning ? " disabled" : ""}>Pivot + archive</button>` : ""}</div>` : ""}
    ${runPanel(isRunning ? activeRun : null)}
    ${candidates.length ? `<section class="workbench-section">${sectionHeader("Candidates", candidates.length)}<div class="card-stack">${candidates.map((candidate) => candidateCard(candidate, selected.id)).join("")}</div></section>` : ""}
    ${dismissed.length ? `<section class="workbench-section dismissed-section">${sectionHeader("Dismissed candidates", dismissed.length)}<div class="dismissed-list">${dismissed.map((candidate) => dismissedCandidateCard(candidate, selected.id)).join("")}</div></section>` : ""}
    <section class="workbench-section">${sectionHeader("Readings", readings.length)}<div class="card-stack">${readings.length ? readings.map(readingCard).join("") : '<div class="quiet-empty">No readings for this entity.</div>'}</div></section>
    <section class="danger-zone"><button class="button button--danger" type="button" data-action="request-remove-entity" data-id="${escapeHtml(selected.id)}">Remove entity</button></section>`;
}

export function renderEntities(model) {
  const { caseData, selected, candidates = [], dismissedCandidates = [], activeRun = null, graphFilters = {} } = model;
  const statusValue = graphFilters.status ?? "active";
  const selectedTypes = new Set(graphFilters.types ?? []);
  const resolvedFilters = statusValue === "all" ? { includeRejected: true } : statusValue === "active" ? {} : { statuses: [statusValue] };
  resolvedFilters.types = [...selectedTypes];
  if (graphFilters.connected && selected) resolvedFilters.connectedTo = selected.id;
  const semanticGraph = graphListModel(caseData, resolvedFilters);
  const contentHtml = `<div class="entities-view">
    <header class="page-header"><div><span class="eyebrow">Entity map</span><h1>Follow the pivot chain</h1><p>Select an entity to inspect its sources, run sensors, and decide which candidates belong in the case.</p></div><div class="page-actions"><label class="filter-control"><span>Edges</span><select data-control="graph-status-filter"><option value="active"${statusValue === "active" ? " selected" : ""}>Active</option><option value="accepted"${statusValue === "accepted" ? " selected" : ""}>Accepted</option><option value="proposed"${statusValue === "proposed" ? " selected" : ""}>Proposed</option><option value="all"${statusValue === "all" ? " selected" : ""}>All</option></select></label><button class="button button--ghost" type="button" data-graph-action="fit">Fit graph</button><button class="button button--ghost" type="button" data-graph-action="reset">Reset layout</button></div></header>
    ${addEntityForm()}
    <div class="graph-filter-bar" aria-label="Graph filters"><span class="eyebrow">Entity types</span>${ENTITY_TYPES.map((type) => `<button class="filter-chip${selectedTypes.has(type) ? " is-active" : ""}" type="button" data-graph-type="${type}" aria-pressed="${selectedTypes.has(type)}">${typeBadge(type)}</button>`).join("")}<button class="filter-chip${graphFilters.connected ? " is-active" : ""}" type="button" data-graph-connected aria-pressed="${Boolean(graphFilters.connected)}"${selected ? "" : " disabled"}>Connected to selection</button></div>
    <div class="entity-workspace">
      <section class="graph-card card"><div class="graph-toolbar"><span>${semanticGraph.nodes.length} entities · ${semanticGraph.links.length} relationships</span><div><button class="button button--small icon-button" type="button" data-graph-action="out" aria-label="Zoom out">−</button><button class="button button--small icon-button" type="button" data-graph-action="in" aria-label="Zoom in">+</button></div></div><svg id="graph" role="img" aria-label="Entity relationship graph"></svg><div class="graph-empty"${semanticGraph.nodes.length ? " hidden" : ""}>No entities match the current filters.</div><div class="sr-only" data-graph-semantic><h2>Graph text alternative</h2>${semanticGraph.nodes.map((entity) => `<button type="button" data-action="select-entity" data-id="${escapeHtml(entity.id)}">${escapeHtml(entity.type)}: ${escapeHtml(entity.value)}</button>`).join("")}${semanticGraph.links.map((link) => `<button type="button" data-action="open-relationship" data-id="${escapeHtml(link.id)}">${escapeHtml(link.status)} relationship: ${escapeHtml(link.rationale)}</button>`).join("")}</div></section>
      <section class="entity-browser card">${sectionHeader("Entities", caseData.entities.length)}${entityList(caseData, selected)}</section>
    </div>
  </div>`;
  return { contentHtml, workbenchHtml: workbench({ caseData, selected, candidates, dismissedCandidates, activeRun }) };
}
