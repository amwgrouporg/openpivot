import { addCompletedRun, addReading, candidatesFrom, uid } from "./store.js";

export const PIVOT_SPECS = {
  domain(entity) {
    return [
      { route: "dns", params: { name: entity.value } },
      { route: "rdap", params: { q: entity.value } },
      { route: "certs", params: { domain: entity.value } },
      { route: "wayback", params: { url: entity.value } },
      { route: "urlscan", params: { domain: entity.value } },
    ];
  },
  ip(entity) {
    return [
      { route: "rdap", params: { q: entity.value } },
      { route: "ip", params: { ip: entity.value } },
      { route: "ptr", params: { ip: entity.value } },
    ];
  },
  url(entity, archive = false) {
    return [
      { route: "wayback", params: { url: entity.value } },
      { route: "extract", params: { url: entity.value } },
      ...(archive ? [{ route: "archive", params: {}, options: { method: "POST", body: { url: entity.value } } }] : []),
    ];
  },
};

export function createRun(entity, actor, specs, now = () => new Date().toISOString()) {
  return {
    id: uid("run"),
    entity_id: entity.id,
    requested_by: actor,
    started_at: now(),
    completed_at: null,
    status: "running",
    sensors: specs.map((spec) => ({ name: spec.route, status: "queued", reading_id: null })),
  };
}

function cloneRun(run) {
  return JSON.parse(JSON.stringify(run));
}

function canCommitToCase(caseData, entity, canCommit, signal) {
  return !signal?.aborted
    && canCommit()
    && caseData.entities.some((item) => item.id === entity.id && item.type === entity.type && item.value === entity.value);
}

function commitPivotResults(caseData, entity, actor, run, envelopes) {
  const staged = {
    ...caseData,
    readings: [...caseData.readings],
    runs: [...(caseData.runs ?? [])],
    log: [...caseData.log],
  };
  const retainedBatchIds = new Set();
  const readings = envelopes.map((envelope, index) => {
    const reading = addReading(staged, entity.id, envelope, actor, { retainReadingIds: retainedBatchIds });
    retainedBatchIds.add(reading.id);
    run.sensors[index].reading_id = reading.id;
    return reading;
  });
  addCompletedRun(staged, cloneRun(run));
  caseData.readings = staged.readings;
  caseData.runs = staged.runs;
  caseData.log = staged.log;
  return readings;
}

export async function runPivot({ caseData, entity, actor, specs, sensorCall, onUpdate = () => {}, now = () => new Date().toISOString(), canCommit = () => true, signal = null }) {
  const run = createRun(entity, actor, specs, now);
  const current = () => canCommitToCase(caseData, entity, canCommit, signal);
  const emit = () => { if (current()) onUpdate(run); };
  emit();

  const envelopes = await Promise.all(specs.map(async (spec, index) => {
    run.sensors[index].status = "running";
    emit();
    const envelope = await sensorCall(spec.route, spec.params, spec.options);
    run.sensors[index].status = envelope.status;
    emit();
    return envelope;
  }));

  run.completed_at = now();
  run.status = envelopes.every((envelope) => envelope.status === "ok") ? "ok" : "indeterminate";
  if (!current()) return { run, readings: [], candidates: [], cancelled: true };
  const readings = commitPivotResults(caseData, entity, actor, run, envelopes);
  emit();

  const seen = new Set();
  const candidates = readings.flatMap((reading, index) => candidatesFrom(caseData, entity, envelopes[index])
    .map((candidate) => ({ ...candidate, source_reading_id: reading.id })))
    .filter((candidate) => {
      const key = `${candidate.type}:${candidate.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { run, readings, candidates, cancelled: false };
}
