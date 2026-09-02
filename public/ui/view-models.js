import { relationshipTypeLabel } from "./copy.js";

const normalizedCandidateValue = (candidate) => String(candidate?.value ?? "").trim().toLowerCase();

export function candidateKey(entityId, candidate) {
  return `${entityId}:${candidate?.type ?? "unknown"}:${normalizedCandidateValue(candidate)}`;
}

export function visibleCandidates(caseData, candidateMap, entityId) {
  const dismissed = new Set(caseData.ui?.dismissed_candidates ?? []);
  return (candidateMap.get(entityId) ?? []).filter((candidate) => !dismissed.has(candidateKey(entityId, candidate)));
}

export function dismissedCandidates(caseData, candidateMap, entityId) {
  const dismissed = new Set(caseData.ui?.dismissed_candidates ?? []);
  return (candidateMap.get(entityId) ?? []).filter((candidate) => dismissed.has(candidateKey(entityId, candidate)));
}

export function relationshipView(caseData, relationship) {
  const entity = (id) => caseData.entities.find((item) => item.id === id) ?? { id, type: "unknown", value: id, missing: true };
  const citations = (relationship.citations ?? []).map((citation) => {
    const collection = citation.kind === "reading" ? caseData.readings : citation.kind === "evidence" ? caseData.evidence : [];
    const record = collection.find((item) => item.id === citation.id);
    return record ? { kind: citation.kind, ...record } : { kind: citation.kind, id: citation.id, missing: true };
  });
  return { ...relationship, from: entity(relationship.from), to: entity(relationship.to), citations };
}

export function buildReviewQueue(caseData, candidateMap = new Map()) {
  const queue = [];
  for (const relationship of caseData.links.filter((link) => link.status === "proposed")) {
    queue.push({ kind: "relationship", id: relationship.id, entity_id: relationship.from, record: relationshipView(caseData, relationship) });
  }
  for (const reading of caseData.readings.filter((item) => item.status === "indeterminate")) {
    queue.push({ kind: "reading", id: reading.id, entity_id: reading.entity_id, record: reading });
  }
  for (const [entityId] of candidateMap) {
    for (const candidate of visibleCandidates(caseData, candidateMap, entityId)) {
      queue.push({ kind: "candidate", id: candidateKey(entityId, candidate), entity_id: entityId, record: candidate });
    }
  }
  for (const run of [...(caseData.runs ?? [])].sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))).slice(0, 6)) {
    queue.push({ kind: "run", id: run.id, entity_id: run.entity_id, record: run });
  }
  return queue;
}

export function evidenceDraftFromReading(caseData, readingId) {
  const reading = caseData.readings.find((item) => item.id === readingId);
  if (!reading) throw new Error("reading not found");
  if (!reading.source_url) throw new Error("reading has no source URL");
  return { reading_id: reading.id, entity_ids: [reading.entity_id], url: reading.source_url, quote: "", relevance: "", archive: false };
}

export function reportSources(caseData) {
  const byUrl = new Map();
  const add = (source) => {
    if (!source?.url || byUrl.has(source.url)) return;
    byUrl.set(source.url, source);
  };
  for (const reading of caseData.readings) add({ kind: "reading", id: reading.id, url: reading.source_url, label: `${reading.sensor}: ${reading.summary}`, status: reading.status });
  for (const evidence of caseData.evidence) add({ kind: "evidence", id: evidence.id, url: evidence.url, label: evidence.quote });
  return [...byUrl.values()];
}

const METHOD_LABELS = { dns: "DNS", rdap: "RDAP", certs: "Certificate transparency", wayback: "Web archive", urlscan: "URL scan", ip: "IP information", ptr: "Reverse DNS", extract: "Page extraction" };

export function groupInvestigativeLeads(caseData, candidateMap) {
  const groups = new Map();
  for (const [parentId] of candidateMap) {
    const parent = caseData.entities.find((entity) => entity.id === parentId);
    if (!parent) continue;
    for (const lead of visibleCandidates(caseData, candidateMap, parentId)) {
      const reading = caseData.readings.find((item) => item.id === lead.source_reading_id);
      const method = METHOD_LABELS[reading?.sensor] ?? "Derived lead";
      const key = `${parentId}:${method}`;
      if (!groups.has(key)) groups.set(key, { id: key, parent, method, sensor: reading?.sensor ?? null, leads: [] });
      groups.get(key).leads.push(lead);
    }
  }
  return [...groups.values()];
}

export function searchCase(caseData, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return [];
  const results = [];
  const add = (kind, id, title, context, view, entity_id = null) => {
    if (`${title} ${context}`.toLowerCase().includes(needle)) results.push({ kind, id, title, context, view, entity_id });
  };
  add("case", caseData.id, caseData.title, `${caseData.brief?.objective ?? ""} ${caseData.brief?.scope ?? ""}`, "overview");
  for (const entity of caseData.entities) add("entity", entity.id, entity.value, `${entity.type} ${entity.notes}`, "entities", entity.id);
  for (const link of caseData.links) {
    const type = link.relationship_type ?? "associated_with";
    add("relationship", link.id, relationshipTypeLabel(type), `${type} ${link.rationale}`, "relationships");
  }
  for (const reading of caseData.readings) add("collection", reading.id, reading.sensor, `${reading.summary} ${reading.source_url ?? ""}`, "entities", reading.entity_id);
  for (const evidence of caseData.evidence) add("evidence", evidence.id, evidence.url, `${evidence.quote} ${evidence.relevance ?? ""}`, "evidence", evidence.entity_ids?.[0] ?? null);
  add("findings", "investigator-notes", "Investigator notes", caseData.memo.human, "report");
  add("findings", "collection-gaps", "Outstanding questions and collection gaps", caseData.memo.gaps ?? "", "report");
  add("findings", "methodology", "Methodology and handling notes", caseData.memo.methodology ?? "", "report");
  add("agent-draft", "agent-draft", "Agent draft", caseData.memo.agent, "report");
  return results.slice(0, 50);
}
