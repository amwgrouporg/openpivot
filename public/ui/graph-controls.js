import { escapeHtml } from "./components.js";
import { relationshipTypeLabel } from "./copy.js";
import { shortestPath } from "../graph-model.js";

const GRAPH_PREFERENCES = {
  graph_layout: ["force", "lanes", "radial"],
  graph_hops: ["all", 1, 2],
  graph_activity_window: ["all", "24h", "7d", "30d"],
  graph_labels: ["auto", "all", "focus"],
};

export function graphPreferenceUpdate(caseData, name, value) {
  const validValues = GRAPH_PREFERENCES[name];
  const normalized = name === "graph_hops"
    ? value === "1" || value === 1 ? 1 : value === "2" || value === 2 ? 2 : value
    : value;
  if (!validValues?.includes(normalized)) throw new Error("invalid graph preference");
  caseData.ui ??= {};
  caseData.ui[name] = normalized;
  return normalized;
}

export function nextPathSelection(state, entityId, visibleLinks) {
  const current = state ?? {};
  if (!current.pathStartId || current.pathEndId) {
    return { ...current, pathStartId: entityId, pathEndId: null, path: null };
  }
  const path = shortestPath(visibleLinks, current.pathStartId, entityId);
  return { ...current, pathStartId: current.pathStartId, pathEndId: entityId, path };
}

function preferenceButton(field, value, label, selected, disabled = false) {
  return `<button class="button button--small${selected ? " button--primary" : " button--ghost"}" type="button" data-graph-preference="${field}" data-value="${value}" aria-pressed="${selected}"${disabled ? " disabled" : ""}>${label}</button>`;
}

export function renderPathBreadcrumb(caseData, path) {
  if (!path?.nodeIds?.length) return '<p class="graph-path-empty">No path is present in the current graph filters.</p>';
  const entities = new Map((caseData?.entities ?? []).map((entity) => [entity.id, entity]));
  const links = new Map((caseData?.links ?? []).map((link) => [link.id, link]));
  const parts = [];
  for (let index = 0; index < path.nodeIds.length; index += 1) {
    const entity = entities.get(path.nodeIds[index]);
    parts.push(`<span class="graph-path-node">${escapeHtml(entity?.value ?? path.nodeIds[index])}</span>`);
    const link = links.get(path.linkIds?.[index]);
    if (link) parts.push(`<span class="graph-path-link">${escapeHtml(relationshipTypeLabel(link.relationship_type))}</span>`);
  }
  return `<div class="graph-path-breadcrumb" aria-label="Relationship path">${parts.join("<span aria-hidden=\"true\"> → </span>")}<button class="button button--small button--ghost" type="button" data-graph-action="clear-path">Clear path</button></div>`;
}

export function renderGraphControls(model = {}) {
  const preferences = model.preferences ?? {};
  const selectedId = model.selectedId ?? null;
  const pathMode = Boolean(model.pathMode);
  const path = model.path ?? null;
  const densityMessage = model.density?.message ?? "";
  const breadcrumb = path
    ? renderPathBreadcrumb(model.caseData, path)
    : model.pathStartId && model.pathEndId
      ? renderPathBreadcrumb(model.caseData, null)
      : pathMode && model.pathStartId
        ? '<p class="graph-path-empty">Choose an end entity to complete the path.</p>'
        : "";

  return `<section class="graph-control-deck" aria-label="Investigation graph controls">
    <div class="graph-control-group" role="group" aria-label="Layout">
      ${preferenceButton("graph_layout", "force", "Relationship map", preferences.graph_layout === "force")}
      ${preferenceButton("graph_layout", "lanes", "Entity lanes", preferences.graph_layout === "lanes")}
      ${preferenceButton("graph_layout", "radial", "Radial focus", preferences.graph_layout === "radial", !selectedId)}
    </div>
    <div class="graph-control-group" role="group" aria-label="Hops">
      ${preferenceButton("graph_hops", "all", "All entities", preferences.graph_hops === "all")}
      ${preferenceButton("graph_hops", "1", "1 hop", Number(preferences.graph_hops) === 1)}
      ${preferenceButton("graph_hops", "2", "2 hops", Number(preferences.graph_hops) === 2)}
    </div>
    <label class="filter-control"><span>Case activity</span><select data-control="graph-activity-window"><option value="all"${preferences.graph_activity_window === "all" ? " selected" : ""}>All activity</option><option value="24h"${preferences.graph_activity_window === "24h" ? " selected" : ""}>Last 24 hours</option><option value="7d"${preferences.graph_activity_window === "7d" ? " selected" : ""}>Last 7 days</option><option value="30d"${preferences.graph_activity_window === "30d" ? " selected" : ""}>Last 30 days</option></select></label>
    <label class="filter-control"><span>Labels</span><select data-control="graph-label-mode"><option value="auto"${preferences.graph_labels === "auto" ? " selected" : ""}>Automatic</option><option value="all"${preferences.graph_labels === "all" ? " selected" : ""}>All labels</option><option value="focus"${preferences.graph_labels === "focus" ? " selected" : ""}>Focus labels</option></select></label>
    <div class="graph-control-group" role="group" aria-label="Path and canvas actions">
      <button class="button button--small${pathMode ? " button--primary" : " button--ghost"}" type="button" data-graph-action="trace-path" aria-pressed="${pathMode}">Trace path</button>
      <button class="button button--small button--ghost" type="button" data-graph-action="clear-path"${path || pathMode ? "" : " disabled"}>Clear path</button>
      <button class="button button--small button--ghost" type="button" data-graph-action="fit">Fit graph</button>
      <button class="button button--small button--ghost" type="button" data-graph-action="fit-selection"${selectedId ? "" : " disabled"}>Fit selection</button>
      <button class="button button--small button--ghost" type="button" data-graph-action="reset">Reset layout</button>
    </div>
    <p class="graph-path-instructions">${pathMode ? "Choose a start and end entity to trace the shortest visible relationship path." : "Choose Trace path to select two entities in the current graph."}</p>
    ${breadcrumb}
    ${densityMessage ? `<p class="graph-density-notice">${escapeHtml(densityMessage)}</p>` : ""}
    <p class="sr-only" aria-live="polite">${pathMode ? (path ? "Path traced." : "Path tracing is active.") : "Graph controls updated."}</p>
    <details class="graph-legend"><summary>Graph legend</summary><p>Solid lines are accepted relationships. Dashed lines are pending analyst review. Node color identifies entity type.</p></details>
  </section>`;
}
