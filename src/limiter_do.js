// Exact per-key sliding-window limiter as a Durable Object. One instance per client key,
// so the count is shared by every isolate and machine in every location.
const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;

export class Limiter {
  constructor(state) {
    this.state = state;
    this.hits = [];
  }

  async fetch(request) {
    let opts = {};
    try { opts = await request.json(); } catch { /* defaults */ }
    const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;
    const windowMs = Number.isInteger(opts.window_ms) && opts.window_ms > 0 ? opts.window_ms : DEFAULT_WINDOW_MS;
    const now = Date.now();
    this.hits = this.hits.filter((t) => now - t < windowMs);
    if (this.hits.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((this.hits[0] + windowMs - now) / 1000));
      return Response.json({ allowed: false, remaining: 0, retry_after: retryAfter });
    }
    this.hits.push(now);
    return Response.json({ allowed: true, remaining: limit - this.hits.length, retry_after: 0 });
  }
}
