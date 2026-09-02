// Input validation for selectors. Strict on purpose: the Worker forwards these to
// public registries, so a malformed selector must be rejected here, not upstream.

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:xn--[a-z0-9-]{1,59}|[a-z]{2,63})$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function normalizeHostname(input) {
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase();
  if (s.endsWith(".")) s = s.slice(0, -1);
  if (s.startsWith("*.")) s = s.slice(2);
  if (IPV4_RE.test(s)) return null;
  return HOSTNAME_RE.test(s) ? s : null;
}

export function isIPv4(s) {
  return typeof s === "string" && IPV4_RE.test(s.trim());
}

export function isIPv6(s) {
  if (typeof s !== "string" || !s.includes(":") || /[^0-9a-fA-F:.]/.test(s)) return false;
  try {
    const u = new URL(`http://[${s.trim()}]/`);
    return u.hostname.startsWith("[");
  } catch {
    return false;
  }
}

export function normalizeIp(input) {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (isIPv4(s)) return s;
  if (isIPv6(s)) return s.toLowerCase();
  return null;
}

// Private, loopback, link-local and special-use ranges the Worker must never fetch.
export function isPrivateIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export function isPrivateIPv6(ip) {
  const s = ip.toLowerCase();
  return s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80") || s.startsWith("::ffff:");
}

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".home", ".lan", ".corp", ".intranet"];

export function parseHttpUrl(input) {
  if (typeof input !== "string" || input.length > 2048) return null;
  let u;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return null;
  if (isIPv4(host) && isPrivateIPv4(host)) return null;
  if (host.startsWith("[") && isPrivateIPv6(host.slice(1, -1))) return null;
  return u;
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function shortText(value, max = 512) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}
