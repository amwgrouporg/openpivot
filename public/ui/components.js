const TYPE_COLORS = {
  domain: "#6ea8fe",
  ip: "#f2bd4a",
  url: "#59d48b",
  org: "#bd91ff",
  document: "#9aa7b7",
  claim: "#ff7b72",
};
import { collectionStatusLabel, relationshipStatusLabel } from "./copy.js";

const ICONS = {
  overview: '<path d="M4 4h6v6H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 14h6v6H4z"/>',
  entities: '<circle cx="7" cy="12" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="m9.7 10.7 4.5-2.4M9.7 13.3l4.5 2.4"/>',
  relationships: '<path d="M8 12h8M5 8a4 4 0 1 0 0 8M19 8a4 4 0 1 1 0 8"/>',
  evidence: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>',
  report: '<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/>',
  export: '<path d="M12 3v12M7 10l5 5 5-5M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  warning: '<path d="M12 3 2.8 20h18.4zM12 9v5M12 17v.1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function shorten(value, length = 72) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function icon(name, label = "") {
  const body = ICONS[name] ?? ICONS.overview;
  const aria = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"';
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${aria}>${body}</svg>`;
}

export function safeLink(url, text) {
  let safe = false;
  try { safe = ["http:", "https:"].includes(new URL(String(url)).protocol); } catch { /* inert text */ }
  const label = escapeHtml(text ?? shorten(url, 56));
  if (!safe) return `<span class="source-link source-link--inert">${label}</span>`;
  let host = "source";
  try { host = new URL(String(url)).hostname; } catch { /* already validated */ }
  return `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(url)}"><span>${label}</span><span class="source-host">${escapeHtml(host)}</span></a>`;
}

export function statusBadge(status) {
  const value = String(status ?? "unknown").toLowerCase();
  const label = ["proposed", "accepted", "rejected"].includes(value) ? relationshipStatusLabel(value) : collectionStatusLabel(value);
  const glyph = value === "ok" || value === "accepted" ? icon("check") : value === "indeterminate" || value === "proposed" ? icon("warning") : icon("close");
  return `<span class="badge badge--status badge--${escapeHtml(value)}">${glyph}<span>${escapeHtml(label)}</span></span>`;
}

export function actorBadge(actor) {
  const value = actor === "agent" ? "agent" : "human";
  const label = value === "human" ? "investigator" : "agent";
  return `<span class="badge badge--actor badge--${value}"><span class="actor-dot"></span><span>${label}</span></span>`;
}

export function typeBadge(type) {
  const value = String(type ?? "unknown");
  const color = TYPE_COLORS[value] ?? "#9aa7b7";
  return `<span class="badge badge--type" style="--type-color:${color}"><span class="type-mark"></span><span>${escapeHtml(value)}</span></span>`;
}

export function sectionHeader(title, count, action = "") {
  return `<div class="section-heading"><div><h2>${escapeHtml(title)}</h2>${count === undefined ? "" : `<span class="count-pill">${Number(count)}</span>`}</div>${action}</div>`;
}

export function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export { TYPE_COLORS };
