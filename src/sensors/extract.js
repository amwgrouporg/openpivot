// Readable text extraction for one URL. Deterministic: HTMLRewriter, no model.
import { ok, indeterminate, fetchWithTimeout, readTextCapped } from "../envelope.js";
import { UA } from "./wayback.js";
import { parseHttpUrl, isIPv4, isIPv6, isPrivateIp } from "../validate.js";
import { queryType } from "./dns.js";

const MAX_HOPS = 5;

// Resolves the hostname through DoH and refuses private or special-use answers. A
// failed lookup refuses too: the target's address is then unknown, not proven public.
export async function assertResolvesPublic(url, fetcher) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIPv4(host) || isIPv6(host)) { if (isPrivateIp(host)) throw new Error("target is a private address"); return; }
  const answers = await Promise.all(["A", "AAAA"].map((t) => queryType(host, t, fetcher).catch((e) => { throw new Error(`could not resolve ${host}: ${e.message}`); })));
  const ips = answers.flatMap((a) => a.records.map((r) => r.value)).filter((v) => isIPv4(v) || isIPv6(v));
  if (ips.length === 0) throw new Error(`${host} has no public address records`);
  const bad = ips.find((ip) => isPrivateIp(ip));
  if (bad) throw new Error(`${host} resolves to a private address (${bad})`);
}

// Follows redirects by hand so every hop passes the same target checks as the first.
export async function fetchPublic(url, init, fetcher) {
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    await assertResolvesPublic(current, fetcher);
    const res = await fetcher(current.href, { ...init, redirect: "manual" }, 20000);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) return { res, finalUrl: current.href };
      let next;
      try { next = parseHttpUrl(new URL(loc, current.href).href); } catch { next = null; }
      if (!next) throw new Error(`redirect to a disallowed target refused (${loc.slice(0, 120)})`);
      current = next;
      continue;
    }
    return { res, finalUrl: current.href };
  }
  throw new Error(`more than ${MAX_HOPS} redirects`);
}

const SKIP = "script,style,noscript,template,svg,iframe,canvas,object";
const BLOCK = "p,div,br,li,ul,ol,h1,h2,h3,h4,h5,h6,tr,section,article,header,footer,blockquote,pre,table,nav,aside,dd,dt,figcaption";
const TEXT_CAP = 20000;
const LINK_CAP = 100;

export function collapseWhitespace(s) {
  return s.replace(/[ \t\r\f\v ]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Pure given an HTML string. Exercises the same HTMLRewriter path as production.
export async function extractFromHtml(html, baseUrl) {
  let skip = 0;
  let inTitle = false;
  let title = "";
  let description = null;
  let text = "";
  const links = [];
  const rewriter = new HTMLRewriter()
    .on(SKIP, { element(e) { skip++; e.onEndTag(() => { skip--; }); } })
    .on("title", { element(e) { inTitle = true; e.onEndTag(() => { inTitle = false; }); }, text(t) { title += t.text; } })
    .on("meta", {
      element(e) {
        const key = (e.getAttribute("name") || e.getAttribute("property") || "").toLowerCase();
        if (!description && (key === "description" || key === "og:description")) description = e.getAttribute("content");
      },
    })
    .on("a[href]", {
      element(e) {
        if (skip > 0 || links.length >= LINK_CAP) return;
        const href = e.getAttribute("href");
        if (!href || href.startsWith("javascript:")) return;
        try {
          const abs = new URL(href, baseUrl).href;
          if (!links.includes(abs)) links.push(abs);
        } catch { /* unresolvable href: not a link */ }
      },
    })
    .on(BLOCK, { element() { text += "\n"; } })
    .on("body", { text(t) { if (skip === 0 && !inTitle) text += t.text; } });
  await rewriter.transform(new Response(html)).arrayBuffer();
  const collapsed = collapseWhitespace(text);
  return {
    title: collapseWhitespace(title) || null,
    description: description ? collapseWhitespace(description).slice(0, 500) : null,
    text: collapsed.slice(0, TEXT_CAP),
    text_truncated: collapsed.length > TEXT_CAP,
    links,
    links_truncated: links.length >= LINK_CAP,
  };
}

export async function extractSensor(url, fetcher = fetchWithTimeout, selfOrigin = null) {
  const sourceUrl = url.href;
  let res;
  let finalUrl;
  try {
    if (selfOrigin && url.origin === selfOrigin.origin) {
      // Own static assets: served from the binding, never over the network. The asset
      // layer answers /x.html with a redirect to /x, so follow up to three hops.
      let next = sourceUrl;
      for (let hop = 0; hop < 3; hop++) {
        res = await selfOrigin.assets.fetch(new Request(next));
        const loc = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && loc) { next = new URL(loc, next).href; continue; }
        break;
      }
      res = new Response(res.body, { status: res.status, headers: res.headers });
      finalUrl = next;
    } else {
      ({ res, finalUrl } = await fetchPublic(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5" } }, fetcher));
    }
  } catch (e) {
    return indeterminate("extract", sourceUrl, e.message);
  }
  finalUrl = finalUrl ?? res.url ?? sourceUrl;
  const contentType = res.headers.get("content-type") || "";
  const base = { requested_url: sourceUrl, final_url: finalUrl, http_status: res.status, content_type: contentType };
  if (!res.ok) return indeterminate("extract", sourceUrl, `http ${res.status}`, base);
  const isText = /text\/html|application\/xhtml|text\/plain|application\/xml|text\/xml/i.test(contentType);
  if (!isText) return ok("extract", sourceUrl, { ...base, binary: true, title: null, description: null, text: "", links: [] });
  let body;
  try {
    body = await readTextCapped(res);
  } catch (e) {
    return indeterminate("extract", sourceUrl, `read: ${e.message}`, base);
  }
  if (/text\/plain/i.test(contentType)) {
    const t = collapseWhitespace(body.text);
    return ok("extract", sourceUrl, { ...base, binary: false, title: null, description: null, text: t.slice(0, TEXT_CAP), text_truncated: t.length > TEXT_CAP || body.truncated, links: [] });
  }
  const parsed = await extractFromHtml(body.text, finalUrl);
  return ok("extract", sourceUrl, { ...base, binary: false, ...parsed, text_truncated: parsed.text_truncated || body.truncated });
}
