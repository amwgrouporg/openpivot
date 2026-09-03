import { escapeHtml, icon } from "./components.js";
import { COPY } from "./copy.js";

export const PRIMARY_VIEWS = COPY.navigation;

function navigation(activeView, counts, className) {
  return `<nav class="${className}" aria-label="Case navigation" data-primary-nav>${PRIMARY_VIEWS.map((view) => {
    const active = view.id === activeView;
    const count = Number(counts?.[view.id] ?? 0);
    return `<button class="nav-item${active ? " is-active" : ""}" type="button" data-view-action="${view.id}" aria-label="${view.label}"${active ? ' aria-current="page"' : ""}>${icon(view.icon)}<span class="nav-label">${view.label}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</button>`;
  }).join("")}</nav>`;
}

export function renderShell({ caseData, activeView, counts = {}, webmcpState, contentHtml, workbenchHtml = "", noticeHtml = "", searchQuery = "", searchResultsHtml = "", searchOpen = false }) {
  const tools = webmcpState?.toolNames ?? [];
  const siteStatus = webmcpState?.available
    ? `<span class="connection-dot is-ready"></span><strong>${tools.length} collection tools available</strong><span class="connection-detail">WebMCP connected</span>`
    : `<span class="connection-dot"></span><strong>Collection tools unavailable</strong><span class="connection-detail">Open in the ChatGPT desktop browser</span>`;
  const accepted = caseData.links?.filter((link) => link.status === "accepted").length ?? 0;
  const pending = caseData.links?.filter((link) => link.status === "proposed").length ?? 0;

  return `<div class="app-shell" data-app-shell>
    <div class="app-depth-field" aria-hidden="true"></div>
    <header class="topbar">
      <a class="brand" href="#overview" data-view-action="overview" aria-label="OpenPivot overview"><span class="brand-mark">OP</span><span class="brand-name">OpenPivot</span></a>
      <div class="case-identity">
        <span class="eyebrow">Cyber investigation</span>
        <input id="case-title" class="case-title" type="text" value="${escapeHtml(caseData.title)}" aria-label="Case title" spellcheck="false">
      </div>
      <div class="case-search${searchOpen ? " is-command-open" : ""}"><label class="sr-only" for="case-search">Search this case</label>${icon("search")}<input id="case-search" type="search" value="${escapeHtml(searchQuery)}" placeholder="Search entities, collection, evidence, findings" autocomplete="off" aria-controls="case-search-results" aria-expanded="${Boolean(searchResultsHtml)}" aria-keyshortcuts="Meta+K Control+K"><span class="search-shortcut" aria-hidden="true"><kbd>⌘K</kbd><span>/</span><kbd>Ctrl K</kbd></span>${searchResultsHtml}</div>
      <div class="topbar-stats" aria-label="Case totals"><span><strong>${caseData.entities?.length ?? 0}</strong> entities</span><span><strong>${accepted}</strong> relationships in case</span>${pending ? `<span class="attention"><strong>${pending}</strong> pending review</span>` : ""}</div>
      <button class="button button--ghost topbar-action" type="button" data-action="export-markdown">${icon("export")}<span>Export</span></button>
      <button class="button button--quiet topbar-action" type="button" data-action="new-case">New case</button>
    </header>
    <aside class="side-rail">
      <div class="case-pulse">
        <span class="eyebrow">Investigation pulse</span>
        <strong>${pending ? `${pending} relationship${pending === 1 ? "" : "s"} pending` : "No relationship reviews pending"}</strong>
        <span>${caseData.readings?.length ?? 0} collection results · ${caseData.evidence?.length ?? 0} evidence entr${caseData.evidence?.length === 1 ? "y" : "ies"}</span>
      </div>
      ${navigation(activeView, counts, "desktop-nav")}
      <div class="rail-spacer"></div>
      <button class="activity-button" type="button" data-action="toggle-activity"><span>Audit trail</span><span>${caseData.log?.length ?? 0}</span></button>
    </aside>
    <div class="workspace-frame">
      ${noticeHtml}
      <main class="main-surface" data-main-surface tabindex="-1">${contentHtml}</main>
      <aside class="workbench${workbenchHtml ? " is-open" : ""}" data-workbench aria-label="Contextual workbench">${workbenchHtml}</aside>
    </div>
    ${navigation(activeView, counts, "bottom-nav")}
    <footer class="connection-bar" data-live-status aria-live="polite"><div>${siteStatus}</div><span class="connection-tools">${tools.join(" · ")}</span></footer>
    <div class="modal-host" data-modal-host></div>
    <div class="toast-host" data-toast-host aria-live="polite"></div>
  </div>`;
}
