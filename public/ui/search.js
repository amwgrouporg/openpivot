import { escapeHtml, icon } from "./components.js";

export function renderSearchResults(query, results) {
  if (!String(query ?? "").trim()) return "";
  const labels = { case: "Investigation", entity: "Entity", relationship: "Technical relationship", collection: "Collection result", evidence: "Evidence entry", findings: "Findings", "agent-draft": "Agent draft" };
  return `<div class="case-search-results" id="case-search-results" role="listbox" aria-label="Case search results">${results.length ? results.map((result) => `<button type="button" role="option" data-action="search-result" data-view="${escapeHtml(result.view)}" data-id="${escapeHtml(result.id)}" data-entity-id="${escapeHtml(result.entity_id ?? "")}"><span class="search-kind">${escapeHtml(labels[result.kind] ?? result.kind)}</span><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml(result.context)}</small></button>`).join("") : `<div class="search-empty">${icon("search")}No matching case records</div>`}</div>`;
}
