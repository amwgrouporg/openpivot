// OpenPivot investigation cockpit. The browser owns the ledger; WebMCP and human
// interactions share the same domain operations while preserving actor attribution.
import { createLocalCaseRepository } from "./repository.js";
import { candidatesFrom, exportMarkdown, findEntity, log, setMemo } from "./store.js";
import { sensor } from "./api.js";
import { getModelContext, createRegistry } from "./webmcp.js";
import { createToolset } from "./tools.js";
import { PIVOT_SPECS, runPivot } from "./runs.js";
import { createGraph } from "./graph.js";
import { buildReviewQueue, candidateKey, evidenceDraftFromReading, visibleCandidates } from "./ui/view-models.js";
import { escapeHtml, icon, statusBadge } from "./ui/components.js";
import { renderShell } from "./ui/shell.js";
import { renderOverview } from "./ui/overview.js";
import { renderEntities } from "./ui/entities.js";
import { createCaseActions, parseCandidate } from "./ui/events.js";

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
  notice: "",
  modal: null,
  toast: null,
  activityOpen: false,
  evidenceDraft: null,
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
  toolset?.syncDynamicTools();
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
  return envelope.status === "ok" ? envelope.data?.archived_url ?? null : null;
}

const actions = createCaseActions({
  getCase: () => caseData,
  persist,
  setUi,
  runEntityPivot: executeEntityPivot,
});

toolset = createToolset({
  getCase: () => caseData,
  persist,
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
    report: caseData.memo.agent || caseData.memo.human ? 1 : 0,
  };
}

function placeholder(title, body) {
  return `<section class="placeholder-view"><span class="eyebrow">Workspace</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></section>`;
}

function activityWorkbench() {
  return `<div class="workbench-head"><div><span class="eyebrow">Case ledger</span><h2>Activity</h2></div><button class="button button--quiet icon-button" type="button" data-action="close-activity" aria-label="Close activity">${icon("close")}</button></div><div class="activity-log">${caseData.log.map((entry) => `<div class="activity-entry"><strong>${escapeHtml(entry.action)} · ${escapeHtml(entry.actor)}</strong><span>${escapeHtml(entry.detail)}</span></div>`).join("") || '<div class="quiet-empty">No activity yet.</div>'}</div>`;
}

function modalHtml() {
  if (!ui.modal) return "";
  if (ui.modal.kind === "new-case") return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">Start a new case?</h2><p>The current case remains in local storage until this new case replaces it. Export first if you need a portable copy.</p><div class="modal-actions"><button class="button button--ghost" type="button" data-action="cancel-modal">Cancel</button><button class="button button--danger" type="button" data-action="confirm-new-case">Start new case</button></div></section></div>`;
  const affected = ui.modal.affected;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">Remove ${escapeHtml(ui.modal.label)}?</h2><p>This also removes ${affected.links} relationship${affected.links === 1 ? "" : "s"} and ${affected.readings} reading${affected.readings === 1 ? "" : "s"}, and detaches the entity from ${affected.evidence} evidence record${affected.evidence === 1 ? "" : "s"}. You can undo the removal until the next change.</p><div class="modal-actions"><button class="button button--ghost" type="button" data-action="cancel-modal">Cancel</button><button class="button button--danger" type="button" data-action="confirm-remove-entity" data-id="${escapeHtml(ui.modal.id)}">Remove entity</button></div></section></div>`;
}

function toastHtml() {
  if (!ui.toast) return "";
  return `<div class="toast"><span>${escapeHtml(ui.toast.message)}</span>${ui.toast.undo ? '<button class="button button--small button--ghost" type="button" data-action="undo-removal">Undo</button>' : ""}<button class="button button--quiet icon-button" type="button" data-action="dismiss-toast" aria-label="Dismiss notification">${icon("close")}</button></div>`;
}

function activeContent(queue, webmcpState) {
  if (ui.view === "overview") return { contentHtml: renderOverview({ caseData, queue, webmcpState }), workbenchHtml: "" };
  if (ui.view === "entities") {
    const selected = ui.selected ? findEntity(caseData, ui.selected) : null;
    return renderEntities({ caseData, selected, candidates: selected ? visibleCandidates(caseData, ui.candidates, selected.id) : [], activeRun: ui.activeRun });
  }
  if (ui.view === "relationships") return { contentHtml: placeholder("Relationships", "Review agent-proposed connections and the sources that support them."), workbenchHtml: "" };
  if (ui.view === "evidence") return { contentHtml: placeholder("Evidence", "Capture exact quotes and keep every source attached to the entities it supports."), workbenchHtml: "" };
  return { contentHtml: placeholder("Report", "Bring analyst judgment, agent research, and cited sources into one exportable memo."), workbenchHtml: "" };
}

function render() {
  graph?.destroy?.();
  graph = null;
  const queue = buildReviewQueue(caseData, ui.candidates);
  const webmcpState = { available: Boolean(modelContext), toolNames: registry.names() };
  const content = activeContent(queue, webmcpState);
  const noticeHtml = ui.notice ? `<div class="notice">${icon("warning")}<span>${escapeHtml(ui.notice)}</span><button class="button button--quiet icon-button" type="button" data-action="dismiss-notice" aria-label="Dismiss error">${icon("close")}</button></div>` : "";
  app.innerHTML = renderShell({
    caseData,
    activeView: ui.view,
    counts: counts(queue),
    webmcpState,
    contentHtml: content.contentHtml,
    workbenchHtml: ui.activityOpen ? activityWorkbench() : content.workbenchHtml,
    noticeHtml,
  });
  app.querySelector("[data-modal-host]").innerHTML = modalHtml();
  app.querySelector("[data-toast-host]").innerHTML = toastHtml();
  if (ui.view === "entities") {
    const svg = document.getElementById("graph");
    if (svg) {
      graph = createGraph(svg, { onSelect: (id) => { ui.selected = id; caseData.ui.selected_entity_id = id; render(); } });
      graph.select(ui.selected);
      graph.update(caseData);
    }
  }
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

app.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form='add-entity']");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  try { actions.addEntity({ type: data.type, value: data.value, notes: data.notes }); }
  catch (error) { showError(error); }
});

app.addEventListener("change", (event) => {
  if (event.target.id !== "case-title") return;
  caseData.title = event.target.value.trim() || "Untitled case";
  log(caseData, "human", "rename_case", caseData.title);
  persist();
});

app.addEventListener("click", async (event) => {
  const view = event.target.closest("[data-view-action]")?.dataset.viewAction;
  if (view) {
    event.preventDefault();
    ui.view = view;
    ui.activityOpen = false;
    render();
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
  const element = event.target.closest("[data-action]");
  if (!element) return;
  const { action, id } = element.dataset;
  try {
    if (action === "export-markdown") {
      const filename = `${caseData.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "case"}.md`;
      download(exportMarkdown(caseData), "text/markdown", filename);
      log(caseData, "human", "export_case", filename);
      persist();
    }
    if (action === "new-case") { ui.modal = { kind: "new-case" }; render(); }
    if (action === "confirm-new-case") { caseData = repository.create(); ui.selected = null; ui.candidates.clear(); ui.modal = null; ui.view = "overview"; persist(); }
    if (action === "cancel-modal") { ui.modal = null; render(); }
    if (action === "select-entity") { actions.selectEntity(id); ui.view = "entities"; render(); }
    if (action === "close-workbench") { ui.selected = null; caseData.ui.selected_entity_id = null; persist(); }
    if (action === "run-pivot") await actions.runPivot(id, false);
    if (action === "run-pivot-archive") await actions.runPivot(id, true);
    if (action === "add-candidate") actions.addCandidate(element.dataset.parent, parseCandidate(element));
    if (action === "add-propose-candidate") actions.addAndProposeCandidate(element.dataset.parent, parseCandidate(element));
    if (action === "dismiss-candidate") {
      const candidate = parseCandidate(element);
      const key = candidateKey(element.dataset.parent, candidate);
      actions.dismissCandidate(element.dataset.parent, candidate, key);
      ui.toast = { message: `${candidate.value} dismissed`, undo: false };
      render();
    }
    if (action === "request-remove-entity") {
      const entity = findEntity(caseData, id);
      ui.modal = { kind: "remove", id, label: entity.value, affected: { links: caseData.links.filter((link) => link.from === id || link.to === id).length, readings: caseData.readings.filter((reading) => reading.entity_id === id).length, evidence: caseData.evidence.filter((evidence) => evidence.entity_ids.includes(id)).length } };
      render();
    }
    if (action === "confirm-remove-entity") { actions.removeEntity(id); ui.modal = null; ui.toast = { message: "Entity removed", undo: true }; render(); }
    if (action === "undo-removal") { actions.undoRemoval(); ui.toast = { message: "Entity restored", undo: false }; render(); }
    if (action === "dismiss-toast") { ui.toast = null; render(); }
    if (action === "dismiss-notice") { ui.notice = ""; render(); }
    if (action === "toggle-activity") { ui.activityOpen = true; render(); }
    if (action === "close-activity") { ui.activityOpen = false; render(); }
    if (action === "open-relationship") { ui.view = "relationships"; render(); }
    if (action === "evidence-from-reading") { ui.evidenceDraft = evidenceDraftFromReading(caseData, id); ui.view = "evidence"; render(); }
  } catch (error) { showError(error); }
});

registry.onChange(render);
render();
await toolset.registerStaticTools();
await toolset.syncDynamicTools();
render();
