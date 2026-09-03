// Exact per-key sliding-window limiter as a Durable Object. One instance per client key,
// so the count is shared by every isolate and machine in every location. The hit list
// lives in the object's storage, so an evicted and revived instance carries the window
// on instead of starting from zero. A storage failure throws; the Worker treats a
// throwing limiter as "limited", never as an open door.
const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;
const HITS_KEY = "hits";

// Storage answers with the last persisted list, or nothing before the first hit. Anything
// else is corruption, and a corrupt counter refuses rather than opening the window.
function validHits(saved) {
  if (saved === undefined || saved === null) return [];
  if (!Array.isArray(saved) || !saved.every((t) => Number.isFinite(t))) throw new Error("stored hit list is not a list of timestamps");
  return saved;
}

export class Limiter {
  constructor(state) {
    this.state = state;
    this.hits = null;
    this.loading = null;
  }

  async load() {
    if (this.hits) return this.hits;
    if (!this.loading) {
      this.loading = this.state.storage.get(HITS_KEY)
        .then((saved) => { this.hits = validHits(saved); return this.hits; })
        .finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  async fetch(request) {
    let opts = {};
    try { opts = await request.json(); } catch { /* defaults */ }
    const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;
    const windowMs = Number.isInteger(opts.window_ms) && opts.window_ms > 0 ? opts.window_ms : DEFAULT_WINDOW_MS;
    const now = Date.now();
    // A timestamp after "now" is clock skew, not a hit; it must not block the key for hours.
    const hits = (await this.load()).filter((t) => t <= now && now - t < windowMs);
    if (hits.length >= limit) {
      this.hits = hits;
      const retryAfter = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)); // hits[0] <= now, so this never exceeds the window
      return Response.json({ allowed: false, remaining: 0, retry_after: retryAfter });
    }
    hits.push(now);
    await this.state.storage.put(HITS_KEY, hits);
    this.hits = hits;
    return Response.json({ allowed: true, remaining: limit - hits.length, retry_after: 0 });
  }
}
