import { escapeHtml, icon } from "./components.js";

export const PRIMARY_VIEWS = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "entities", label: "Entities", icon: "entities" },
  { id: "relationships", label: "Relationships", icon: "relationships" },
  { id: "evidence", label: "Evidence", icon: "evidence" },
  { id: "report", label: "Report", icon: "report" },
];

function navigation(activeView, counts, className) {
  return `<nav class="${className}" aria-label="Case navigation" data-primary-nav>${PRIMARY_VIEWS.map((view) => {
    const active = view.id === activeView;
    const count = Number(counts?.[view.id] ?? 0);
    return `<button class="nav-item${active ? " is-active" : ""}" type="button" data-view-action="${view.id}"${active ? ' aria-current="page"' : ""}>${icon(view.icon)}<span class="nav-label">${view.label}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</button>`;
  }).join("")}</nav>`;
}

export function renderShell({ caseData, activeView, counts = {}, webmcpState, contentHtml, workbenchHtml = "", noticeHtml = "" }) {
  const tools = webmcpState?.toolNames ?? [];
  const siteStatus = webmcpState?.available
    ? `<span class="connection-dot is-ready"></span><strong>${tools.length} site tools ready</strong><span class="connection-detail">WebMCP connected</span>`
    : `<span class="connection-dot"></span><strong>Site tools unavailable</strong><span class="connection-detail">Open in the ChatGPT desktop browser</span>`;
  const accepted = caseData.links?.filter((link) => link.status === "accepted").length ?? 0;
  const pending = caseData.links?.filter((link) => link.status === "proposed").length ?? 0;

  return `<div class="app-shell" data-app-shell>
    <header class="topbar">
      <a class="brand" href="#overview" data-view-action="overview" aria-label="OpenPivot overview"><span class="brand-mark">OP</span><span class="brand-name">OpenPivot</span></a>
      <div class="case-identity">
        <span class="eyebrow">Active case</span>
        <input id="case-title" class="case-title" type="text" value="${escapeHtml(caseData.title)}" aria-label="Case title" spellcheck="false">
      </div>
      <div class="topbar-stats" aria-label="Case totals"><span><strong>${caseData.entities?.length ?? 0}</strong> entities</span><span><strong>${accepted}</strong> accepted</span>${pending ? `<span class="attention"><strong>${pending}</strong> awaiting review</span>` : ""}</div>
      <button class="button button--ghost topbar-action" type="button" data-action="export-markdown">${icon("export")}<span>Export</span></button>
      <button class="button button--quiet topbar-action" type="button" data-action="new-case">New case</button>
    </header>
    <aside class="side-rail">
      <div class="case-pulse">
        <span class="eyebrow">Investigation pulse</span>
        <strong>${pending ? `${pending} decision${pending === 1 ? "" : "s"} waiting` : "Ledger up to date"}</strong>
        <span>${caseData.readings?.length ?? 0} readings · ${caseData.evidence?.length ?? 0} evidence</span>
      </div>
      ${navigation(activeView, counts, "desktop-nav")}
      <div class="rail-spacer"></div>
      <button class="activity-button" type="button" data-action="toggle-activity"><span>Activity log</span><span>${caseData.log?.length ?? 0}</span></button>
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
