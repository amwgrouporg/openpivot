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
  return { reading_id: reading.id, entity_ids: [reading.entity_id], url: reading.source_url, quote: "", archive: false };
}

export function reportSources(caseData) {
  const byUrl = new Map();
  const add = (source) => {
    if (!source?.url || byUrl.has(source.url)) return;
    byUrl.set(source.url, source);
  };
  for (const reading of caseData.readings) add({ kind: "reading", id: reading.id, url: reading.source_url, label: `${reading.sensor}: ${reading.summary}` });
  for (const evidence of caseData.evidence) add({ kind: "evidence", id: evidence.id, url: evidence.url, label: evidence.quote });
  return [...byUrl.values()];
}
