export const CASE_KEY_V1 = "openpivot.case.v1";
export const CASE_KEY_V2 = "openpivot.case.v2";

const clone = (value) => (typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)));

export function createEmptyCase(title = "Untitled case") {
  return {
    version: 2,
    id: `case_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`,
    title,
    created_at: new Date().toISOString(),
    entities: [],
    links: [],
    evidence: [],
    readings: [],
    runs: [],
    memo: { human: "", agent: "", agent_updated_at: null },
    log: [],
    ui: { selected_entity_id: null, graph_positions: {}, dismissed_candidates: [] },
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertNestedCase(value) {
  const fail = (section) => { throw new Error(`invalid case ${section}`); };
  const actors = new Set(["human", "agent"]);
  const entityTypes = new Set(["domain", "ip", "url", "org", "document", "claim"]);
  if (!value.entities.every((item) => isRecord(item) && typeof item.id === "string" && entityTypes.has(item.type) && typeof item.value === "string" && typeof item.notes === "string" && actors.has(item.added_by) && typeof item.added_at === "string")) fail("entities");
  const entityIds = new Set(value.entities.map((item) => item.id));
  if (entityIds.size !== value.entities.length) fail("entity ids");
  if (!value.links.every((item) => isRecord(item) && typeof item.id === "string" && entityIds.has(item.from) && entityIds.has(item.to) && typeof item.rationale === "string" && actors.has(item.asserted_by) && (!item.reviewed_by || actors.has(item.reviewed_by)) && ["proposed", "accepted", "rejected"].includes(item.status) && (!item.citations || (Array.isArray(item.citations) && item.citations.every((citation) => isRecord(citation) && ["reading", "evidence"].includes(citation.kind) && typeof citation.id === "string"))))) fail("links");
  if (!value.evidence.every((item) => isRecord(item) && typeof item.id === "string" && Array.isArray(item.entity_ids) && item.entity_ids.every((id) => entityIds.has(id)) && typeof item.url === "string" && typeof item.quote === "string" && actors.has(item.added_by) && (!item.archive_status || ["not_requested", "pending", "confirmed"].includes(item.archive_status)))) fail("evidence");
  const evidenceIds = new Set(value.evidence.map((item) => item.id));
  if (!value.readings.every((item) => isRecord(item) && typeof item.id === "string" && entityIds.has(item.entity_id) && typeof item.sensor === "string" && ["ok", "indeterminate"].includes(item.status) && actors.has(item.requested_by))) fail("readings");
  const readingIds = new Set(value.readings.map((item) => item.id));
  if (!value.links.every((item) => (item.citations ?? []).every((citation) => citation.kind === "reading" ? readingIds.has(citation.id) : evidenceIds.has(citation.id)))) fail("link citations");
  if (!value.evidence.every((item) => !item.reading_id || readingIds.has(item.reading_id))) fail("evidence reading references");
  if (!value.log.every((item) => isRecord(item) && typeof item.ts === "string" && actors.has(item.actor) && typeof item.action === "string" && typeof item.detail === "string")) fail("log");
  if (value.memo.agent_updated_at != null && typeof value.memo.agent_updated_at !== "string") fail("memo");
  if (value.version === 2) {
    if (!Array.isArray(value.runs) || !value.runs.every((item) => isRecord(item) && typeof item.id === "string" && entityIds.has(item.entity_id) && actors.has(item.requested_by) && ["ok", "indeterminate"].includes(item.status) && Array.isArray(item.sensors) && item.sensors.every((sensor) => isRecord(sensor) && typeof sensor.name === "string" && ["queued", "running", "ok", "indeterminate"].includes(sensor.status)))) fail("runs");
    if (!isRecord(value.ui) || !isRecord(value.ui.graph_positions) || !Object.values(value.ui.graph_positions).every((position) => isRecord(position) && Number.isFinite(position.x) && Number.isFinite(position.y)) || !Array.isArray(value.ui.dismissed_candidates) || !value.ui.dismissed_candidates.every((key) => typeof key === "string")) fail("ui state");
  }
}

export function isValidCase(value) {
  return isRecord(value)
    && (value.version === 1 || value.version === 2)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.created_at === "string"
    && Array.isArray(value.entities)
    && Array.isArray(value.links)
    && Array.isArray(value.evidence)
    && Array.isArray(value.readings)
    && Array.isArray(value.log)
    && isRecord(value.memo)
    && typeof value.memo.human === "string"
    && typeof value.memo.agent === "string";
}

export function migrateCaseV1(input) {
  if (!isValidCase(input) || input.version !== 1) throw new Error("invalid v1 case");
  assertNestedCase(input);
  const migrated = clone(input);
  migrated.version = 2;
  migrated.links = migrated.links.map((link) => ({ ...link, citations: Array.isArray(link.citations) ? link.citations : [] }));
  migrated.evidence = migrated.evidence.map((evidence) => ({ ...evidence, reading_id: evidence.reading_id ?? null, archive_status: evidence.archived_url ? "confirmed" : "not_requested", archive_check_url: null }));
  migrated.runs = [];
  migrated.ui = { selected_entity_id: null, graph_positions: {}, dismissed_candidates: [] };
  return migrated;
}

function normalizeV2(input) {
  if (!isValidCase(input) || input.version !== 2) throw new Error("invalid case");
  const value = clone(input);
  value.links = value.links.map((link) => ({ ...link, citations: Array.isArray(link.citations) ? link.citations : [] }));
  value.evidence = value.evidence.map((evidence) => ({ ...evidence, reading_id: evidence.reading_id ?? null, archive_status: evidence.archive_status ?? (evidence.archived_url ? "confirmed" : "not_requested"), archive_check_url: evidence.archive_check_url ?? null }));
  value.runs = Array.isArray(value.runs) ? value.runs : [];
  value.ui = isRecord(value.ui) ? value.ui : {};
  value.ui.selected_entity_id = value.ui.selected_entity_id ?? null;
  value.ui.graph_positions = isRecord(value.ui.graph_positions) ? value.ui.graph_positions : {};
  value.ui.dismissed_candidates = Array.isArray(value.ui.dismissed_candidates) ? value.ui.dismissed_candidates : [];
  assertNestedCase(value);
  return value;
}

export function createLocalCaseRepository(storage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new Error("storage is required");
  }

  let recoveryNotice = "";
  const save = (caseData) => {
    const valid = normalizeV2(caseData);
    storage.setItem(CASE_KEY_V2, JSON.stringify(valid));
    return valid;
  };

  return {
    load() {
      const current = storage.getItem(CASE_KEY_V2);
      if (current) {
        try { return normalizeV2(JSON.parse(current)); } catch { /* fall through to backup */ }
      }
      const legacy = storage.getItem(CASE_KEY_V1);
      if (legacy) {
        let migrated;
        try { migrated = migrateCaseV1(JSON.parse(legacy)); }
        catch { return createEmptyCase(); }
        try { return save(migrated); }
        catch {
          recoveryNotice = "OpenPivot loaded your legacy case but could not save the migrated case. Export it before continuing; the original v1 case remains intact.";
          return migrated;
        }
      }
      return createEmptyCase();
    },
    save,
    create(title = "Untitled case") {
      const next = createEmptyCase(title);
      save(next);
      return next;
    },
    importJson(text) {
      let parsed;
      try { parsed = JSON.parse(String(text)); } catch { throw new Error("invalid case JSON"); }
      const next = parsed?.version === 1 ? migrateCaseV1(parsed) : normalizeV2(parsed);
      return save(next);
    },
    exportJson(caseData) {
      return JSON.stringify(normalizeV2(caseData), null, 2);
    },
    getRecoveryNotice() { return recoveryNotice; },
  };
}
