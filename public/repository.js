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
  const migrated = clone(input);
  migrated.version = 2;
  migrated.links = migrated.links.map((link) => ({ ...link, citations: Array.isArray(link.citations) ? link.citations : [] }));
  migrated.evidence = migrated.evidence.map((evidence) => ({ ...evidence, reading_id: evidence.reading_id ?? null }));
  migrated.runs = [];
  migrated.ui = { selected_entity_id: null, graph_positions: {}, dismissed_candidates: [] };
  return migrated;
}

function normalizeV2(input) {
  if (!isValidCase(input) || input.version !== 2) throw new Error("invalid case");
  const value = clone(input);
  value.links = value.links.map((link) => ({ ...link, citations: Array.isArray(link.citations) ? link.citations : [] }));
  value.evidence = value.evidence.map((evidence) => ({ ...evidence, reading_id: evidence.reading_id ?? null }));
  value.runs = Array.isArray(value.runs) ? value.runs : [];
  value.ui = isRecord(value.ui) ? value.ui : {};
  value.ui.selected_entity_id = value.ui.selected_entity_id ?? null;
  value.ui.graph_positions = isRecord(value.ui.graph_positions) ? value.ui.graph_positions : {};
  value.ui.dismissed_candidates = Array.isArray(value.ui.dismissed_candidates) ? value.ui.dismissed_candidates : [];
  return value;
}

export function createLocalCaseRepository(storage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new Error("storage is required");
  }

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
        try {
          const migrated = migrateCaseV1(JSON.parse(legacy));
          return save(migrated);
        } catch { /* return a clean recoverable case */ }
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
  };
}
