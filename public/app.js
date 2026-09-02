// OpenPivot investigation cockpit. The browser owns the ledger; WebMCP and human
// interactions share the same domain operations while preserving actor attribution.
import { createLocalCaseRepository } from "./repository.js";
import { candidatesFrom, exportMarkdown, findEntity, log } from "./store.js";
import { sensor } from "./api.js";
import { getModelContext, createRegistry } from "./webmcp.js";
import { createToolset } from "./tools.js";
import { PIVOT_SPECS, runPivot } from "./runs.js";
import { createGraph, mergeGraphPositions } from "./graph.js";
import { buildReviewQueue, candidateKey, dismissedCandidates, evidenceDraftFromReading, groupInvestigativeLeads, searchCase, visibleCandidates } from "./ui/view-models.js";
import { escapeHtml, icon } from "./ui/components.js";
import { renderShell } from "./ui/shell.js";
import { renderOverview } from "./ui/overview.js";
import { renderEntities } from "./ui/entities.js";
import { captureFormState, createCaseActions, leadTriageFocusSelector, parseCandidate, resetTransientUi, restoreFormState } from "./ui/events.js";
import { relationshipFocusFilter, renderRelationships } from "./ui/relationships.js";
import { renderEvidence } from "./ui/evidence.js";
import { renderReport } from "./ui/report.js";
import { renderSearchResults } from "./ui/search.js";

const app = document.getElementById("app");
const repository = createLocalCaseRepository(localStorage);
let caseData = repository.load();
const modelContext = getModelContext();
const registry = createRegistry(modelContext);
let graph = null;
let toolset = null;

const ui = {
  view: caseData.entities.length ? "overview" : "overview",
  selected: caseData.ui?.selected_entity_id ?? null,
  activeRun: null,
  candidates: new Map(),
  notice: repository.getRecoveryNotice(),
  modal: null,
  toast: null,
  activityOpen: false,
  evidenceDraft: null,
  relationshipFilter: "all",
  graphFilters: { status: "active", types: [], connected: false },
  returnFocus: null,
  focusRelationship: null,
  skipFormRestore: false,
  selectedLeadKeys: new Set(),
  searchQuery: "",
};

function hydrateCandidates() {
  const next = new Map();
  for (const entity of caseData.entities) {
    const found = [];
    const seen = new Set();
    for (const reading of caseData.readings.filter((item) => item.entity_id === entity.id && item.raw)) {
      const envelope = { sensor: reading.sensor, data: reading.raw };
      for (const candidate of candidatesFrom(caseData, entity, envelope)) {
        const key = `${candidate.type}:${candidate.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ ...candidate, source_reading_id: reading.id });
      }
    }
    if (found.length) next.set(entity.id, found);
  }
  ui.candidates = next;
}

hydrateCandidates();

function setUi(patch) {
  if ("view" in patch) ui.view = patch.view;
  if ("selected" in patch) {
    ui.selected = patch.selected;
    caseData.ui.selected_entity_id = patch.selected;
  }
}

function persist() {
  caseData.ui.selected_entity_id = ui.selected;
  repository.save(caseData);
  render();
}

async function executeEntityPivot(entity, type, archive = false, actor = "human") {
  if (!PIVOT_SPECS[type]) throw new Error(`${type} entities do not have an automatic pivot`);
  const specs = PIVOT_SPECS[type](entity, archive);
  const result = await runPivot({
    caseData,
    entity,
    actor,
    specs,
    sensorCall: sensor,
    onUpdate(run) {
      ui.activeRun = JSON.parse(JSON.stringify(run));
      render();
    },
  });
  ui.activeRun = result.run;
  ui.candidates.set(entity.id, result.candidates);
  ui.selected = entity.id;
  caseData.ui.selected_entity_id = entity.id;
  persist();
  return result;
}

async function archiveUrl(url) {
  const envelope = await sensor("archive", {}, { method: "POST", body: { url } });
  return {
    archived_url: envelope.status === "ok" ? envelope.data?.archived_url ?? null : null,
    archive_status: envelope.status === "ok" && envelope.data?.archived_url ? "confirmed" : envelope.data?.submitted ? "pending" : "not_requested",
    archive_check_url: envelope.data?.check_url ?? null,
  };
}

const actions = createCaseActions({
  getCase: () => caseData,
  persist,
  setUi,
  runEntityPivot: executeEntityPivot,
});

toolset = createToolset({
  getCase: () => caseData,
  persist() { actions.invalidateUndo(); persist(); },
  registry,
  archiveUrl,
  runEntityPivot: (entity, type, archive) => executeEntityPivot(entity, type, archive, "agent"),
  onSelect(id) { ui.selected = id; caseData.ui.selected_entity_id = id; },
  onCandidates(id, candidates) { ui.candidates.set(id, candidates); },
});

function counts(queue) {
  return {
    overview: queue.filter((item) => item.kind !== "run").length,
    entities: caseData.entities.length,
    relationships: caseData.links.filter((link) => link.status === "proposed").length,
    evidence: caseData.evidence.length,
    report: [caseData.memo.human, caseData.memo.gaps, caseData.memo.methodology, caseData.memo.agent].some(Boolean) ? 1 : 0,
  };
}

function activityWorkbench() {
  return `<div class="workbench-head"><div><span class="eyebrow">Case ledger</span><h2>Activity</h2></div><button class="button button--quiet icon-button" type="button" data-action="close-activity" aria-label="Close activity">${icon("close")}</button></div><div class="activity-log">${caseData.log.map((entry) => `<div class="activity-entry"><strong>${escapeHtml(entry.action)} · ${escapeHtml(entry.actor)}</strong><span>${escapeHtml(entry.detail)}</span></div>`).join("") || '<div class="quiet-empty">No activity yet.</div>'}</div>`;
}

function modalHtml() {
  if (!ui.modal) return "";
  if (ui.modal.kind === "new-case") return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">Start a new case?</h2><p>The current case remains in local storage until this new case replaces it. Export first if you need a portable copy.</p><div class="modal-actions"><button class="button button--ghost" type="button" data-action="cancel-modal">Cancel</button><button class="button button--danger" type="button" data-action="confirm-new-case">Start new case</button></div></section></div>`;
  const affected = ui.modal.affected;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">Remove ${escapeHtml(ui.modal.label)}?</h2><p>This also removes ${affected.links} relationship${affected.links === 1 ? "" : "s"} and ${affected.readings} collection result${affected.readings === 1 ? "" : "s"}, and detaches the entity from ${affected.evidence} evidence entr${affected.evidence === 1 ? "y" : "ies"}. You can undo the removal until the next case change.</p><div class="modal-actions"><button class="button button--ghost" type="button" data-action="cancel-modal">Cancel</button><button class="button button--danger" type="button" data-action="confirm-remove-entity" data-id="${escapeHtml(ui.modal.id)}">Remove entity</button></div></section></div>`;
}

function toastHtml() {
  if (!ui.toast) return "";
  return `<div class="toast"><span>${escapeHtml(ui.toast.message)}</span>${ui.toast.undo ? '<button class="button button--small button--ghost" type="button" data-action="undo-removal">Undo</button>' : ""}${ui.toast.restoreCandidateKey ? `<button class="button button--small button--ghost" type="button" data-action="restore-candidate" data-key="${escapeHtml(ui.toast.restoreCandidateKey)}">Restore</button>` : ""}<button class="button button--quiet icon-button" type="button" data-action="dismiss-toast" aria-label="Dismiss notification">${icon("close")}</button></div>`;
}

function activeContent(queue, webmcpState) {
  if (ui.view === "overview") return { contentHtml: renderOverview({ caseData, queue, webmcpState, leadGroups: groupInvestigativeLeads(caseData, ui.candidates), selectedLeadKeys: ui.selectedLeadKeys }), workbenchHtml: "" };
  if (ui.view === "entities") {
    const selected = ui.selected ? findEntity(caseData, ui.selected) : null;
    return renderEntities({ caseData, selected, candidates: selected ? visibleCandidates(caseData, ui.candidates, selected.id) : [], dismissedCandidates: selected ? dismissedCandidates(caseData, ui.candidates, selected.id) : [], activeRun: ui.activeRun, graphFilters: ui.graphFilters });
  }
  if (ui.view === "relationships") return { contentHtml: renderRelationships({ caseData, statusFilter: ui.relationshipFilter }), workbenchHtml: "" };
  if (ui.view === "evidence") return { contentHtml: renderEvidence({ caseData, draft: ui.evidenceDraft }), workbenchHtml: "" };
  return { contentHtml: renderReport({ caseData }), workbenchHtml: "" };
}

function render() {
  const formState = ui.skipFormRestore ? null : captureFormState(app);
  ui.skipFormRestore = false;
  graph?.destroy?.();
  graph = null;
  const queue = buildReviewQueue(caseData, ui.candidates);
  const webmcpState = { available: Boolean(modelContext), toolNames: registry.names() };
  const content = activeContent(queue, webmcpState);
  const searchResults = searchCase(caseData, ui.searchQuery);
  const noticeHtml = ui.notice ? `<div class="notice">${icon("warning")}<span>${escapeHtml(ui.notice)}</span><button class="button button--quiet icon-button" type="button" data-action="dismiss-notice" aria-label="Dismiss error">${icon("close")}</button></div>` : "";
  app.innerHTML = renderShell({
    caseData,
    activeView: ui.view,
    counts: counts(queue),
    webmcpState,
    contentHtml: content.contentHtml,
    workbenchHtml: ui.activityOpen ? activityWorkbench() : content.workbenchHtml,
    noticeHtml,
    searchQuery: ui.searchQuery,
    searchResultsHtml: renderSearchResults(ui.searchQuery, searchResults),
  });
  app.querySelector("[data-modal-host]").innerHTML = modalHtml();
  app.querySelector("[data-toast-host]").innerHTML = toastHtml();
  restoreFormState(app, formState);
  const modal = app.querySelector("[role='dialog']");
  if (modal) {
    for (const region of app.querySelectorAll(".topbar, .side-rail, .workspace-frame, .bottom-nav, .connection-bar")) {
      region.inert = true;
      region.setAttribute("inert", "");
      region.setAttribute("aria-hidden", "true");
    }
    modal.querySelector("button")?.focus();
  }
  if (ui.focusRelationship) {
    app.querySelector(`[data-relationship-id="${CSS.escape(ui.focusRelationship)}"]`)?.focus();
    ui.focusRelationship = null;
  }
  if (ui.view === "entities") {
    const svg = document.getElementById("graph");
    if (svg) {
      graph = createGraph(svg, {
        onSelectEntity: (id) => { ui.selected = id; caseData.ui.selected_entity_id = id; repository.save(caseData); render(); focusSelector("[data-workbench-title]"); },
        onSelectLink: (id) => { ui.view = "relationships"; ui.relationshipFilter = "all"; ui.focusRelationship = id; render(); },
        onPositionsChange: (positions, options) => { actions.invalidateUndo(); caseData.ui.graph_positions = mergeGraphPositions(caseData.ui.graph_positions, positions, options); repository.save(caseData); },
        reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      });
      graph.select(ui.selected);
      const status = ui.graphFilters.status;
      const filters = status === "all" ? { includeRejected: true } : status === "active" ? {} : { statuses: [status] };
      filters.types = ui.graphFilters.types;
      if (ui.graphFilters.connected && ui.selected) filters.connectedTo = ui.selected;
      graph.update(caseData, filters);
    }
  }
}

function consumeCandidate(parentId, candidate) {
  const key = candidateKey(parentId, candidate);
  ui.candidates.set(parentId, (ui.candidates.get(parentId) ?? []).filter((item) => candidateKey(parentId, item) !== key));
}

function selectedLeadItems() {
  const items = [];
  for (const [parentId, candidates] of ui.candidates) for (const candidate of candidates) {
    const key = candidateKey(parentId, candidate);
    if (ui.selectedLeadKeys.has(key)) items.push({ parentId, candidate, key });
  }
  return items;
}

function restoreReturnFocus() {
  const target = ui.returnFocus;
  ui.returnFocus = null;
  if (!target) return;
  requestAnimationFrame(() => app.querySelector(target)?.focus());
}

function focusSelector(selector) {
  requestAnimationFrame(() => {
    const target = app.querySelector(selector);
    if (!target) return;
    if (!target.matches("button, input, select, textarea, a[href], [tabindex]")) target.setAttribute("tabindex", "-1");
    target.focus();
  });
}

function download(text, type, filename) {
  const blob = new Blob([text], { type });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function showError(error) {
  ui.notice = `Error: ${error?.message ?? error}`;
  render();
}

app.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  try {
    if (form.dataset.form === "add-entity") {
      ui.skipFormRestore = true;
      actions.addEntity({ type: data.type, value: data.value, notes: data.notes });
      await toolset.syncDynamicTools();
      focusSelector("[data-workbench-title]");
    }
    if (form.dataset.form === "add-relationship") {
      ui.skipFormRestore = true;
      ui.relationshipFilter = relationshipFocusFilter(ui.relationshipFilter, "proposed");
      const relationship = actions.createRelationship({ from: data.from, to: data.to, relationship_type: data.relationship_type, rationale: data.rationale, citations: [] });
      ui.focusRelationship = relationship.id;
      ui.toast = { message: "Technical relationship queued for analyst review", undo: false };
      render();
    }
    if (form.dataset.form === "attach-evidence") {
      ui.skipFormRestore = true;
      const archiveResult = data.archive ? await archiveUrl(data.url) : { archived_url: null, archive_status: "not_requested", archive_check_url: null };
      actions.attachEvidence({ entity_ids: formData.getAll("entity_ids"), url: data.url, quote: data.quote, relevance: data.relevance, reading_id: data.reading_id || null, ...archiveResult });
      ui.evidenceDraft = null;
      ui.toast = { message: data.archive && archiveResult.archive_status === "pending" ? "Source excerpt registered; archive capture is not yet confirmed" : "Source excerpt added to the evidence register", undo: false };
      render();
      focusSelector(".evidence-list h2");
    }
    if (form.dataset.form === "edit-notes") {
      actions.editEntityNotes(data.entity_id, data.notes);
      ui.toast = { message: "Entity investigation notes updated", undo: false };
      render();
    }
    if (form.dataset.form === "case-brief") {
      actions.saveCaseBrief({ objective: data.objective, scope: data.scope, status: data.status });
      ui.toast = { message: "Investigation definition updated", undo: false };
      render();
      focusSelector("#case-objective");
    }
  }
  catch (error) { showError(error); }
});

app.addEventListener("change", (event) => {
  if (event.target.id === "case-title") {
    actions.invalidateUndo();
    caseData.title = event.target.value.trim() || "Untitled case";
    log(caseData, "human", "rename_case", caseData.title);
    persist();
  }
  if (event.target.dataset.control === "relationship-filter") {
    ui.relationshipFilter = event.target.value;
    render();
    focusSelector('[data-control="relationship-filter"]');
  }
  if (event.target.dataset.control === "graph-status-filter") {
    ui.graphFilters.status = event.target.value;
    render();
    focusSelector('[data-control="graph-status-filter"]');
  }
  if (event.target.dataset.leadKey) {
    if (event.target.checked) ui.selectedLeadKeys.add(event.target.dataset.leadKey);
    else ui.selectedLeadKeys.delete(event.target.dataset.leadKey);
    render();
    focusSelector(`[data-lead-key="${CSS.escape(event.target.dataset.leadKey)}"]`);
  }
  if (event.target.dataset.action === "import-json") {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then(async (text) => {
      actions.invalidateUndo();
      resetTransientUi(ui);
      caseData = repository.importJson(text);
      ui.selected = caseData.ui.selected_entity_id;
      ui.view = "overview";
      hydrateCandidates();
      persist();
      await toolset.syncDynamicTools();
      requestAnimationFrame(() => app.querySelector(".main-surface")?.focus());
    }).catch(showError);
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "case-search") {
    ui.searchQuery = event.target.value;
    render();
    focusSelector("#case-search");
    return;
  }
  const field = event.target.dataset.findingsField;
  if (!field) return;
  actions.invalidateUndo();
  caseData.memo[field] = event.target.value;
  repository.save(caseData);
});

app.addEventListener("focusout", (event) => {
  const field = event.target.dataset.findingsField;
  if (!field) return;
  log(caseData, "human", "write_findings", `${field} ${caseData.memo[field].length} chars`);
  repository.save(caseData);
});

app.addEventListener("keydown", (event) => {
  const modal = event.target.closest?.("[role='dialog']");
  if (event.target.id === "case-search" && event.key === "ArrowDown") {
    const first = app.querySelector(".case-search-results [role='option']");
    if (first) { event.preventDefault(); first.focus(); }
    return;
  }
  if (event.key === "Escape" && ui.searchQuery && !ui.modal) {
    event.preventDefault();
    ui.searchQuery = "";
    ui.skipFormRestore = true;
    render();
    focusSelector("#case-search");
    return;
  }
  if (event.key === "Escape" && ui.modal) {
    event.preventDefault();
    ui.modal = null;
    render();
    restoreReturnFocus();
    return;
  }
  if (event.key !== "Tab" || !modal) return;
  const controls = [...modal.querySelectorAll("button, input, select, textarea, [href]")].filter((control) => !control.disabled);
  if (!controls.length) return;
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

app.addEventListener("click", async (event) => {
  const view = event.target.closest("[data-view-action]")?.dataset.viewAction;
  if (view) {
    event.preventDefault();
    ui.view = view;
    ui.activityOpen = false;
    render();
    focusSelector(".main-surface h1");
    return;
  }
  const graphAction = event.target.closest("[data-graph-action]")?.dataset.graphAction;
  if (graphAction) {
    if (graphAction === "fit") graph?.fit();
    if (graphAction === "in") graph?.zoom(1.25);
    if (graphAction === "out") graph?.zoom(0.8);
    if (graphAction === "reset") graph?.resetLayout?.();
    return;
  }
  const graphType = event.target.closest("[data-graph-type]")?.dataset.graphType;
  if (graphType) {
    const types = new Set(ui.graphFilters.types);
    if (types.has(graphType)) types.delete(graphType); else types.add(graphType);
    ui.graphFilters.types = [...types];
    render();
    focusSelector(`[data-graph-type="${CSS.escape(graphType)}"]`);
    return;
  }
  if (event.target.closest("[data-graph-connected]")) {
    ui.graphFilters.connected = !ui.graphFilters.connected;
    render();
    focusSelector("[data-graph-connected]");
    return;
  }
  const element = event.target.closest("[data-action]");
  if (!element) return;
  const { action, id } = element.dataset;
  try {
    if (action === "export-markdown") {
      actions.invalidateUndo();
      const filename = `${caseData.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "case"}.md`;
      download(exportMarkdown(caseData), "text/markdown", filename);
      log(caseData, "human", "export_case", filename);
      persist();
      focusSelector('[data-action="export-markdown"]');
    }
    if (action === "export-json") {
      const filename = `${caseData.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "case"}.json`;
      download(repository.exportJson(caseData), "application/json", filename);
    }
    if (action === "new-case") { ui.returnFocus = '[data-action="new-case"]'; ui.modal = { kind: "new-case" }; render(); }
    if (action === "confirm-new-case") { actions.invalidateUndo(); resetTransientUi(ui); caseData = repository.create(); ui.candidates.clear(); ui.view = "overview"; persist(); await toolset.syncDynamicTools(); requestAnimationFrame(() => app.querySelector("#quick-value")?.focus()); }
    if (action === "cancel-modal") { ui.modal = null; render(); restoreReturnFocus(); }
    if (action === "select-entity") { actions.selectEntity(id); ui.view = "entities"; render(); focusSelector("[data-workbench-title]"); }
    if (action === "close-workbench") { const closedId = ui.selected; ui.selected = null; caseData.ui.selected_entity_id = null; persist(); focusSelector(`.entity-row[data-id="${CSS.escape(closedId)}"]`); }
    if (action === "run-pivot") { actions.invalidateUndo(); await actions.runPivot(id, false); focusSelector("[data-workbench-title]"); }
    if (action === "run-pivot-archive") { actions.invalidateUndo(); await actions.runPivot(id, true); focusSelector("[data-workbench-title]"); }
    if (action === "add-candidate") { const candidate = parseCandidate(element); actions.addCandidate(element.dataset.parent, candidate); consumeCandidate(element.dataset.parent, candidate); await toolset.syncDynamicTools(); render(); focusSelector("[data-workbench-title]"); }
    if (action === "add-propose-candidate") { const candidate = parseCandidate(element); actions.addAndProposeCandidate(element.dataset.parent, candidate); consumeCandidate(element.dataset.parent, candidate); await toolset.syncDynamicTools(); render(); focusSelector("[data-workbench-title]"); }
    if (action === "dismiss-candidate") {
      const candidate = parseCandidate(element);
      const key = candidateKey(element.dataset.parent, candidate);
      actions.dismissCandidate(element.dataset.parent, candidate, key);
      ui.toast = { message: `${candidate.value} dismissed as an investigative lead`, undo: false, restoreCandidateKey: key };
      render();
      focusSelector(`[data-action="restore-candidate"][data-key="${CSS.escape(key)}"]`);
    }
    if (action === "restore-candidate") { const key = element.dataset.key; actions.restoreCandidate(key); ui.toast = { message: "Investigative lead restored", undo: false }; render(); focusSelector(`[data-candidate-key="${CSS.escape(key)}"] [data-action='dismiss-candidate']`); }
    if (action === "batch-add-leads") {
      const items = selectedLeadItems();
      actions.addSelectedLeads(items);
      for (const item of items) consumeCandidate(item.parentId, item.candidate);
      ui.selectedLeadKeys.clear();
      await toolset.syncDynamicTools();
      ui.toast = { message: `${items.length} investigative lead${items.length === 1 ? "" : "s"} added as entities`, undo: false };
      render();
      focusSelector(leadTriageFocusSelector(app));
    }
    if (action === "batch-dismiss-leads") {
      const items = selectedLeadItems();
      actions.dismissSelectedLeads(items);
      ui.selectedLeadKeys.clear();
      ui.toast = { message: `${items.length} investigative lead${items.length === 1 ? "" : "s"} dismissed`, undo: false };
      render();
      focusSelector(leadTriageFocusSelector(app));
    }
    if (action === "request-remove-entity") {
      const entity = findEntity(caseData, id);
      ui.returnFocus = `[data-action="request-remove-entity"][data-id="${CSS.escape(id)}"]`;
      ui.modal = { kind: "remove", id, label: entity.value, affected: { links: caseData.links.filter((link) => link.from === id || link.to === id).length, readings: caseData.readings.filter((reading) => reading.entity_id === id).length, evidence: caseData.evidence.filter((evidence) => evidence.entity_ids.includes(id)).length } };
      render();
    }
    if (action === "confirm-remove-entity") { actions.removeEntity(id); ui.modal = null; ui.returnFocus = null; ui.toast = { message: "Entity removed", undo: true }; await toolset.syncDynamicTools(); render(); requestAnimationFrame(() => app.querySelector('[data-action="undo-removal"]')?.focus()); }
    if (action === "undo-removal") { actions.undoRemoval(); ui.toast = { message: "Entity restored", undo: false }; await toolset.syncDynamicTools(); render(); focusSelector("[data-workbench-title]"); }
    if (action === "dismiss-toast") { ui.toast = null; render(); }
    if (action === "dismiss-notice") { ui.notice = ""; render(); }
    if (action === "toggle-activity") { ui.activityOpen = true; render(); focusSelector(".workbench h2"); }
    if (action === "close-activity") { ui.activityOpen = false; render(); focusSelector('[data-action="toggle-activity"]'); }
    if (action === "open-relationship") { ui.view = "relationships"; ui.relationshipFilter = "all"; ui.focusRelationship = id; render(); }
    if (action === "accept-relationship") { ui.relationshipFilter = relationshipFocusFilter(ui.relationshipFilter, "accepted"); ui.focusRelationship = id; actions.setRelationshipStatus(id, "accepted"); ui.toast = { message: "Relationship accepted into the case", undo: false }; render(); focusSelector(`[data-relationship-id="${CSS.escape(id)}"]`); }
    if (action === "reject-relationship") { ui.relationshipFilter = relationshipFocusFilter(ui.relationshipFilter, "rejected"); ui.focusRelationship = id; actions.setRelationshipStatus(id, "rejected"); ui.toast = { message: "Relationship rejected from the case", undo: false }; render(); focusSelector(`[data-relationship-id="${CSS.escape(id)}"]`); }
    if (action === "evidence-from-reading") { ui.evidenceDraft = evidenceDraftFromReading(caseData, id); ui.view = "evidence"; render(); focusSelector("#evidence-url"); }
    if (action === "search-result") {
      ui.searchQuery = "";
      ui.skipFormRestore = true;
      ui.view = element.dataset.view;
      if (element.dataset.entityId) { ui.selected = element.dataset.entityId; caseData.ui.selected_entity_id = ui.selected; repository.save(caseData); }
      if (ui.view === "relationships") ui.focusRelationship = id;
      render();
      if (ui.view === "entities") focusSelector("[data-workbench-title]");
      else if (ui.view === "relationships") focusSelector(`[data-relationship-id="${CSS.escape(id)}"]`);
      else if (ui.view === "evidence") focusSelector(`[data-evidence-id="${CSS.escape(id)}"]`);
      else focusSelector(".main-surface h1");
    }
  } catch (error) { showError(error); }
});

registry.onChange(render);
render();
await toolset.registerStaticTools();
await toolset.syncDynamicTools();
render();
