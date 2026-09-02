// Case state. Lives in the browser only. Every record carries who asserted it and when.
import { CASE_KEY_V1, CASE_KEY_V2, createEmptyCase, createLocalCaseRepository } from "./repository.js";

export const ENTITY_TYPES = ["domain", "ip", "url", "org", "document", "claim"];
export const LINK_STATUS = ["proposed", "accepted", "rejected"];
export const ACTORS = ["human", "agent"];

export function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function newCase(title = "Untitled case") {
  return createEmptyCase(title);
}

export function loadCase() {
  try { return createLocalCaseRepository(localStorage).load(); }
  catch { return newCase(); }
}

export function saveCase(c) {
  try { createLocalCaseRepository(localStorage).save(c); }
  catch (e) {
    console.warn("openpivot: could not persist case", e);
  }
}

export { CASE_KEY_V1, CASE_KEY_V2 };

function assertActor(actor) {
  if (!ACTORS.includes(actor)) throw new Error(`actor outside vocabulary: ${actor}`);
}

export function log(c, actor, action, detail) {
  assertActor(actor);
  c.log.unshift({ ts: new Date().toISOString(), actor, action, detail: String(detail ?? "").slice(0, 300) });
  if (c.log.length > 500) c.log.length = 500;
}

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:xn--[a-z0-9-]{1,59}|[a-z]{2,63})$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function normalizeValue(type, value) {
  let v = String(value ?? "").trim();
  if (type === "domain") {
    v = v.toLowerCase().replace(/^\*\./, "");
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(v) || v.includes("/") || v.includes(":")) {
      try { v = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(v) ? v : `http://${v}`).hostname; } catch { /* leave as typed; validated below */ }
    }
    v = v.replace(/\.$/, "");
  }
  if (type === "ip") v = v.toLowerCase().replace(/^\[|\]$/g, "");
  if (type === "url") v = v.replace(/\s+/g, "");
  return v;
}

// Throws on selectors no sensor could ever accept, so the board never holds dead entities.
export function validateValue(type, v) {
  if (type === "domain" && !HOSTNAME_RE.test(v)) throw new Error(`not a hostname: ${v}`);
  if (type === "ip" && !(IPV4_RE.test(v) || (v.includes(":") && /^[0-9a-f:.]+$/.test(v)))) throw new Error(`not an IP address: ${v}`);
  if (type === "url") {
    let u;
    try { u = new URL(v); } catch { throw new Error(`not a URL: ${v}`); }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`only http(s) URLs: ${v}`);
  }
}

export function isHttpUrl(s) {
  try { const u = new URL(String(s)); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; }
}

export function addEntity(c, { type, value, notes }, actor) {
  assertActor(actor);
  if (!ENTITY_TYPES.includes(type)) throw new Error(`entity type outside vocabulary: ${type}`);
  const v = normalizeValue(type, value);
  if (!v) throw new Error("value required");
  validateValue(type, v);
  const existing = c.entities.find((e) => e.type === type && e.value === v);
  if (existing) {
    if (notes) existing.notes = [existing.notes, notes].filter(Boolean).join("\n");
    return { entity: existing, created: false };
  }
  const entity = { id: uid("ent"), type, value: v, notes: notes ? String(notes).slice(0, 2000) : "", added_by: actor, added_at: new Date().toISOString() };
  c.entities.push(entity);
  log(c, actor, "add_entity", `${type} ${v}`);
  return { entity, created: true };
}

export function findEntity(c, id) {
  return c.entities.find((e) => e.id === id) ?? null;
}

function ensureUi(c) {
  c.ui ??= { selected_entity_id: null, graph_positions: {}, dismissed_candidates: [] };
  c.ui.graph_positions ??= {};
  c.ui.dismissed_candidates ??= [];
  return c.ui;
}

export function dismissCandidate(c, key) {
  const ui = ensureUi(c);
  const value = String(key);
  if (!ui.dismissed_candidates.includes(value)) ui.dismissed_candidates.push(value);
}

export function restoreCandidate(c, key) {
  const ui = ensureUi(c);
  ui.dismissed_candidates = ui.dismissed_candidates.filter((value) => value !== String(key));
}

export function addCompletedRun(c, run) {
  if (!run?.completed_at) throw new Error("only completed runs can be stored");
  c.runs ??= [];
  c.runs.push(run);
  if (c.runs.length > 100) c.runs.splice(0, c.runs.length - 100);
  return run;
}

export function removeEntity(c, id, actor) {
  assertActor(actor);
  const entityIndex = c.entities.findIndex((entity) => entity.id === id);
  if (entityIndex < 0) throw new Error("entity not found");
  const snapshot = {
    actor,
    entityIndex,
    entity: c.entities[entityIndex],
    links: c.links.filter((item) => item.from === id || item.to === id),
    readings: c.readings.filter((item) => item.entity_id === id),
    evidenceEntityIds: c.evidence.map((item) => ({ id: item.id, entity_ids: [...item.entity_ids] })),
  };
  c.entities.splice(entityIndex, 1);
  c.links = c.links.filter((item) => item.from !== id && item.to !== id);
  c.readings = c.readings.filter((item) => item.entity_id !== id);
  c.evidence.forEach((item) => { item.entity_ids = item.entity_ids.filter((entityId) => entityId !== id); });
  if (c.ui?.selected_entity_id === id) c.ui.selected_entity_id = null;
  log(c, actor, "remove_entity", id);
  return snapshot;
}

export function restoreRemoval(c, snapshot) {
  if (!snapshot?.entity?.id) throw new Error("invalid removal snapshot");
  if (!findEntity(c, snapshot.entity.id)) c.entities.splice(snapshot.entityIndex, 0, snapshot.entity);
  const linkIds = new Set(c.links.map((item) => item.id));
  c.links.push(...snapshot.links.filter((item) => !linkIds.has(item.id)));
  const readingIds = new Set(c.readings.map((item) => item.id));
  c.readings.push(...snapshot.readings.filter((item) => !readingIds.has(item.id)));
  for (const saved of snapshot.evidenceEntityIds) {
    const evidence = c.evidence.find((item) => item.id === saved.id);
    if (evidence) evidence.entity_ids = [...saved.entity_ids];
  }
  log(c, snapshot.actor, "restore_entity", snapshot.entity.id);
}

export function addLink(c, { from, to, rationale, citations = [] }, actor, status = "proposed") {
  assertActor(actor);
  if (!LINK_STATUS.includes(status)) throw new Error(`link status outside vocabulary: ${status}`);
  if (!findEntity(c, from) || !findEntity(c, to)) throw new Error("both entities must exist");
  if (from === to) throw new Error("cannot link an entity to itself");
  const dup = c.links.find((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
  if (dup) return { link: dup, created: false };
  const checkedCitations = citations.map((citation) => {
    if (!citation || !["reading", "evidence"].includes(citation.kind)) throw new Error("citation kind must be reading or evidence");
    const exists = citation.kind === "reading"
      ? c.readings.some((reading) => reading.id === citation.id)
      : c.evidence.some((evidence) => evidence.id === citation.id);
    if (!exists) throw new Error(`citation not found: ${citation.id}`);
    return { kind: citation.kind, id: citation.id };
  });
  const link = { id: uid("lnk"), from, to, rationale: String(rationale ?? "").slice(0, 1000), citations: checkedCitations, asserted_by: actor, status, at: new Date().toISOString() };
  c.links.push(link);
  log(c, actor, "link_entities", `${findEntity(c, from).value} -> ${findEntity(c, to).value} (${status})`);
  return { link, created: true };
}

export function setLinkStatus(c, id, status, actor) {
  assertActor(actor);
  if (!LINK_STATUS.includes(status)) throw new Error(`link status outside vocabulary: ${status}`);
  const link = c.links.find((l) => l.id === id);
  if (!link) throw new Error("link not found");
  link.status = status;
  link.reviewed_by = actor;
  link.reviewed_at = new Date().toISOString();
  log(c, actor, "review_link", `${status}: ${link.rationale.slice(0, 80)}`);
  return link;
}

export function addEvidence(c, { entity_ids, url, quote, archived_url, reading_id = null }, actor) {
  assertActor(actor);
  const ids = (Array.isArray(entity_ids) ? entity_ids : []).filter((id) => findEntity(c, id));
  if (reading_id && !c.readings.some((reading) => reading.id === reading_id)) throw new Error("reading not found");
  const ev = { id: uid("evd"), entity_ids: ids, url: String(url ?? "").trim().slice(0, 2048), quote: String(quote ?? "").slice(0, 4000), captured_at: new Date().toISOString(), archived_url: archived_url ?? null, added_by: actor, untrusted: true, reading_id };
  if (!isHttpUrl(ev.url)) throw new Error("url must be http(s)");
  if (ev.archived_url && !isHttpUrl(ev.archived_url)) ev.archived_url = null;
  c.evidence.push(ev);
  log(c, actor, "attach_evidence", ev.url);
  return ev;
}

export function addReading(c, entityId, envelope, actor) {
  assertActor(actor);
  const reading = { id: uid("rdg"), entity_id: entityId, sensor: envelope.sensor, status: envelope.status, source_url: envelope.source_url, fetched_at: envelope.fetched_at, error: envelope.error, summary: summarize(envelope), raw: envelope.data, untrusted: true, requested_by: actor };
  c.readings.unshift(reading);
  if (c.readings.length > 400) c.readings.length = 400;
  log(c, actor, "reading", `${envelope.sensor} ${envelope.status}`);
  return reading;
}

export function setMemo(c, actor, text) {
  assertActor(actor);
  c.memo[actor] = String(text ?? "").slice(0, 20000);
  if (actor === "agent") c.memo.agent_updated_at = new Date().toISOString();
  log(c, actor, "write_memo", `${c.memo[actor].length} chars`);
}

// Deterministic one-line summary of a sensor envelope, for the UI and the agent.
export function summarize(env) {
  const d = env.data;
  if (env.status !== "ok" && !d) return `indeterminate: ${env.error}`;
  if (env.sensor === "archive") {
    if (d.archived_url) return `archived: ${d.archived_url}`;
    return `submitted, snapshot not confirmed (${String(env.error ?? "").split(";")[0]}); check ${d.check_url}`;
  }
  const prefix = env.status === "ok" ? "" : `partial (${env.error}): `;
  try {
    switch (env.sensor) {
      case "dns": {
        const r = d.records;
        const parts = [];
        for (const t of ["A", "AAAA", "CNAME", "NS", "MX"]) if (r[t]?.length) parts.push(`${t} ${r[t].map((x) => (x.null_mx ? "null MX (no mail)" : x.exchange ?? x.value)).join(", ")}`);
        if (r.TXT?.length) parts.push(`TXT x${r.TXT.length}`);
        return prefix + (parts.join(" | ") || `no records (${Object.values(d.rcodes).join("/")})`);
      }
      case "ptr": return prefix + (d.hostnames.length ? `PTR ${d.hostnames.join(", ")}` : `no PTR (${d.rcode})`);
      case "rdap":
        if (d.kind === "domain") return prefix + (d.registered === false ? "not registered at the registry" : `registrar ${d.registrar?.name ?? "n/a"}; ${d.events.map((e) => `${e.action} ${String(e.date).slice(0, 10)}`).join(", ")}; NS ${d.nameservers.join(", ") || "n/a"}`);
        return prefix + `${d.name ?? d.handle ?? "n/a"} ${d.cidrs.join(", ")} ${d.country ?? ""}`.trim();
      case "certs": return prefix + `${d.certificate_count} certs, ${d.distinct_names.length} names, first ${String(d.first_seen).slice(0, 10)}, last ${String(d.last_seen).slice(0, 10)}`;
      case "wayback":
        if (d.precision === "closest-snapshot") return prefix + (d.sample?.length ? `snapshots ${String(d.first_seen).slice(0, 8)} to ${String(d.last_seen).slice(0, 8)} via availability API, capture count unknown` : "no snapshot known to the availability API");
        return prefix + (d.captures_in_index ? `${d.captures_in_index} months with captures, ${d.first_seen.slice(0, 8)} to ${d.last_seen.slice(0, 8)}` : "no captures in the CDX index");
      case "archive": return prefix + (d.archived_url ? `archived: ${d.archived_url}` : `submitted; check ${d.check_url}`);
      case "urlscan": return prefix + `${d.total} public scans` + (d.scans[0] ? `; latest ${String(d.scans[0].time).slice(0, 10)} ip ${d.scans[0].ip} ${d.scans[0].asn_name ?? ""}` : "");
      case "ip": return prefix + `${d.asn ?? ""} ${d.org ?? ""} ${d.city ?? ""} ${d.country ?? ""}`.replace(/\s+/g, " ").trim();
      case "search": return prefix + `${d.result_count} results` + (d.results[0] ? `; top: ${d.results[0].url}` : "");
      case "wikidata": return prefix + `${d.result_count} entities` + (d.results[0] ? `; top: ${d.results[0].id} ${d.results[0].label}` : "");
      case "extract": return prefix + (d.binary ? `binary ${d.content_type}` : `${d.title ?? "(no title)"}; ${d.text.length} chars, ${d.links.length} links; http ${d.http_status}`);
      case "queries": return prefix + `${d.queries.length} queries`;
      default: return prefix + JSON.stringify(d).slice(0, 160);
    }
  } catch (e) {
    return `summary unavailable: ${e.message}`;
  }
}

// Candidate selectors surfaced by a reading. Presented, never auto-added.
export function candidatesFrom(c, entity, env) {
  const d = env.data;
  if (!d) return [];
  const have = new Set(c.entities.map((e) => `${e.type}:${e.value}`));
  const out = [];
  const add = (type, value, why) => {
    const v = normalizeValue(type, value);
    try { validateValue(type, v); } catch { return; }
    if (!v || v === entity.value || have.has(`${type}:${v}`)) return;
    if (out.some((x) => x.type === type && x.value === v)) return;
    out.push({ type, value: v, why });
  };
  switch (env.sensor) {
    case "dns":
      for (const r of d.records?.A ?? []) add("ip", r.value, "A record");
      for (const r of d.records?.AAAA ?? []) add("ip", r.value, "AAAA record");
      for (const r of d.records?.NS ?? []) add("domain", r.value, "nameserver");
      for (const r of d.records?.MX ?? []) add("domain", r.exchange, "mail exchanger");
      for (const r of d.records?.CNAME ?? []) add("domain", r.value, "CNAME target");
      break;
    case "certs":
      for (const n of d.distinct_names ?? []) add("domain", n, "name on a certificate");
      break;
    case "rdap":
      for (const ns of d.nameservers ?? []) add("domain", ns, "registry nameserver");
      if (d.registrar?.name) add("org", d.registrar.name, "registrar");
      break;
    case "urlscan":
      for (const s of d.scans ?? []) if (s.ip) add("ip", s.ip, "urlscan page ip");
      break;
    case "ptr":
      for (const h of d.hostnames ?? []) add("domain", h, "reverse DNS");
      break;
    case "ip":
      if (d.hostname) add("domain", d.hostname, "ipinfo hostname");
      if (d.org) add("org", d.org, "network owner");
      break;
    case "extract":
      for (const l of (d.links ?? []).slice(0, 40)) {
        try { add("domain", new URL(l).hostname, "outbound link"); } catch { /* skip */ }
      }
      break;
    default:
      break;
  }
  return out.slice(0, 60);
}

export function exportMarkdown(c) {
  const e = (id) => findEntity(c, id);
  const lines = [];
  lines.push(`# ${c.title}`, "", `Case ${c.id}. Created ${c.created_at}. Exported ${new Date().toISOString()}.`, "");
  lines.push("## Entities", "");
  for (const x of c.entities) lines.push(`- **${x.type}** ${x.value} (added by ${x.added_by}, ${x.added_at})${x.notes ? ` -- ${x.notes.replace(/\n/g, " ")}` : ""}`);
  lines.push("", "## Links", "");
  for (const l of c.links.filter((l) => l.status !== "rejected")) {
    lines.push(`- ${e(l.from)?.value ?? l.from} -> ${e(l.to)?.value ?? l.to} [${l.status}, asserted by ${l.asserted_by}]: ${l.rationale}`);
    const sources = (l.citations ?? []).map((citation) => citation.kind === "reading"
      ? c.readings.find((reading) => reading.id === citation.id)?.source_url
      : c.evidence.find((evidence) => evidence.id === citation.id)?.url).filter(Boolean);
    if (sources.length) lines.push(`  - Citations: ${sources.join(", ")}`);
  }
  const rejected = c.links.filter((l) => l.status === "rejected");
  if (rejected.length) {
    lines.push("", "### Rejected links", "");
    for (const l of rejected) lines.push(`- ${e(l.from)?.value ?? l.from} -> ${e(l.to)?.value ?? l.to} (proposed by ${l.asserted_by}, rejected by ${l.reviewed_by}): ${l.rationale}`);
  }
  lines.push("", "## Evidence", "");
  for (const v of c.evidence) lines.push(`- ${v.url}${v.archived_url ? ` (archived: ${v.archived_url})` : ""} -- captured ${v.captured_at} by ${v.added_by}; entities: ${v.entity_ids.map((id) => e(id)?.value ?? id).join(", ") || "none"}`, `  > ${v.quote.replace(/\n/g, "\n  > ")}`);
  lines.push("", "## Sensor readings", "");
  for (const r of c.readings) lines.push(`- ${e(r.entity_id)?.value ?? r.entity_id} / ${r.sensor} [${r.status}] ${r.fetched_at}: ${r.summary}${r.source_url ? ` <${r.source_url}>` : ""}`);
  lines.push("", "## Findings memo", "", "### Analyst", "", c.memo.human || "(empty)", "", `### Agent${c.memo.agent_updated_at ? ` (updated ${c.memo.agent_updated_at})` : ""}`, "", c.memo.agent || "(empty)", "");
  lines.push("## Log", "");
  for (const l of c.log.slice(0, 100)) lines.push(`- ${l.ts} ${l.actor} ${l.action}: ${l.detail}`);
  return lines.join("\n");
}
