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

export async function runPivot({ caseData, entity, actor, specs, sensorCall, onUpdate = () => {}, now = () => new Date().toISOString() }) {
  const run = createRun(entity, actor, specs, now);
  onUpdate(run);

  const readings = await Promise.all(specs.map(async (spec, index) => {
    run.sensors[index].status = "running";
    onUpdate(run);
    const envelope = await sensorCall(spec.route, spec.params, spec.options);
    const reading = addReading(caseData, entity.id, envelope, actor);
    run.sensors[index].status = envelope.status;
    run.sensors[index].reading_id = reading.id;
    onUpdate(run);
    return { envelope, reading };
  }));

  run.completed_at = now();
  run.status = readings.every(({ envelope }) => envelope.status === "ok") ? "ok" : "indeterminate";
  addCompletedRun(caseData, JSON.parse(JSON.stringify(run)));
  onUpdate(run);

  const seen = new Set();
  const candidates = readings.flatMap(({ envelope, reading }) => candidatesFrom(caseData, entity, envelope)
    .map((candidate) => ({ ...candidate, source_reading_id: reading.id })))
    .filter((candidate) => {
      const key = `${candidate.type}:${candidate.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { run, readings: readings.map(({ reading }) => reading), candidates };
}
