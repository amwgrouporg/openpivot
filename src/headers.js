// Security headers for the board's static assets. The API sets its own headers in
// envelope.js; this layer only touches responses that come from the asset binding.
// DETERMINISTIC-BY-DESIGN: a response-header policy has to be identical on every request.
// REDTEAM: fable-5 2026-09-03 (docs/REDTEAM_fable5_20260903.md, findings 2 and 6)
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // per-type colours are set through inline style attributes
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

export function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  if (/^text\/html\b/i.test(headers.get("content-type") ?? "")) {
    headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-frame-options", "DENY");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
