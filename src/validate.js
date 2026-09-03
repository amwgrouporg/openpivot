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
  const mapped = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped && isIPv4(mapped[1])) return mapped[1];
  if (isIPv6(s)) return s.toLowerCase();
  return null;
}

export function isPrivateIp(ip) {
  return isIPv4(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
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

// Parses an IPv6 literal into eight 16-bit groups. Handles "::" compression and an
// embedded dotted-quad tail. Returns null when the text is not an IPv6 address.
export function ipv6Groups(ip) {
  if (typeof ip !== "string") return null;
  let s = ip.trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  // A dotted quad may stand only where the last two groups of the whole address go: at the
  // end of the tail, or at the end of the head when no "::" follows to fill in after it.
  const end = tail.length ? tail : halves.length === 2 ? null : head;
  const last = end?.at(-1);
  if (last && last.includes(".")) {
    if (!IPV4_RE.test(last)) return null;
    const [a, b, c, d] = last.split(".").map(Number);
    end.splice(-1, 1, ((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
  }
  const groups = [...head, ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  if (halves.length === 2) {
    const missing = 8 - groups.length;
    if (missing < 1) return null;
    return [...head, ...Array(missing).fill("0"), ...tail].map((g) => parseInt(g, 16));
  }
  return groups.length === 8 ? groups.map((g) => parseInt(g, 16)) : null;
}

// Special-use IPv6 the Worker must never fetch, decided on prefix bits. Text that does
// not parse as IPv6 is refused too: an address that cannot be read is not proven public.
export function isPrivateIPv6(ip) {
  const g = ipv6Groups(ip);
  if (!g) return true;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = g;
  const embeddedV4 = (hi, lo) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && (h5 === 0 || h5 === 0xffff)) return true; // ::/96 (unspecified, loopback, IPv4-compatible) and ::ffff:0:0/96 (IPv4-mapped)
  if (h0 === 0x64 && h1 === 0xff9b) {
    if (h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) return isPrivateIPv4(embeddedV4(h6, h7)); // 64:ff9b::/96 NAT64 well-known prefix
    if (h2 === 1) return true; // 64:ff9b:1::/48 local-use translation
  }
  if (h0 === 0x2002) return isPrivateIPv4(embeddedV4(h1, h2)); // 2002::/16 6to4
  if ((h0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h0 & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((h0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (h0 === 0x2001 && h1 === 0x0db8) return true; // 2001:db8::/32 documentation
  if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) return true; // 100::/64 discard-only
  return false;
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
  if (u.port) return null; // default ports only: the Worker is not a port scanner
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
