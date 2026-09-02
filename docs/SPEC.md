# OpenPivot -- design spec

Date: 2026-09-02. Status: approved scope, frozen for the WebMCP Challenge build.
This file is the contract. Anything not listed here is out of scope for v1.

## Problem

An investigation is a pivot chain. Every finding yields new selectors, and each
selector needs several lookups across several public registries. Analysts run that
chain by hand across many tabs. Agents left to browse those registries guess at UIs
and misread results. Neither party keeps provenance.

## What v1 is

A single-page investigation board plus a same-origin Worker. The page registers
WebMCP tools. The agent decides which pivot to run next and what a result means.
The Worker is a set of deterministic sensors over the open web's public record.
The board owns the ledger: every entity, link and evidence item carries who asserted
it (human or agent), when, and the source URL.

Audience: journalists, fact-checkers, security researchers, trust-and-safety teams.

## Non-goals (v1)

- No natural-person pivots: no username sweeps, no email-to-profile, no people search,
  no breach data, no face or biometric lookups. Entities are domains, IPs, URLs,
  organizations, documents and claims.
- No accounts, no server-side case storage. Case state lives in the browser.
- No metered or paid sensors beyond free tiers of Brave Search, ipinfo and urlscan.
- No declarative (form-attribute) WebMCP; no iframes.

## Architecture

- `public/` static page: vanilla ES modules, D3 force graph from cdnjs.
- `src/worker.js` Cloudflare Worker: `/api/*` sensor routes; serves `public/` as
  static assets. Per-client rate limit on `/api/*`: a Durable Object per client key (exact,
  shared across isolates) plus the rate-limit binding; a failing limiter refuses, never passes.
- Secrets: `BRAVE_API_KEY`, `IPINFO_TOKEN`, `URLSCAN_API_KEY` (Worker secrets, never
  in the repo). Routes degrade to INDETERMINATE when a secret is absent.

## Data model (browser, localStorage, versioned key `openpivot.case.v1`)

```
case      {id, title, created_at, entities[], links[], evidence[], readings[], memo, log[]}
entity    {id, type: domain|ip|url|org|document|claim, value, notes, added_by, added_at}
link      {id, from, to, rationale, asserted_by, status: proposed|accepted|rejected, at}
evidence  {id, entity_ids[], url, quote, captured_at, archived_url, added_by, untrusted}
reading   {id, entity_id, sensor, status: ok|indeterminate, source_url, fetched_at,
           summary, raw, untrusted: true}
log       {ts, actor: human|agent, action, detail}
```

`added_by` / `asserted_by` / `actor` are `human` or `agent`. Tool calls write `agent`;
UI actions write `human`.

## Sensor envelope (every `/api/*` response)

```
{ ok: bool, sensor, source_url, fetched_at, status: "ok"|"indeterminate",
  data|null, error|null, untrusted: true }
```

Absence invariant: a transport failure, timeout, rate limit, missing key or parse
error is `status: "indeterminate"`, never an empty `data` presented as "nothing found".

## Sensors (Worker routes)

| Route | Upstream | Returns |
|---|---|---|
| `GET /api/dns?name=` | Cloudflare DNS over HTTPS | A, AAAA, NS, MX, TXT, CNAME |
| `GET /api/rdap?q=` | rdap.org (domain or ip) | registrar, events, nameservers, status; for IP: handle, name, cidr, country, org |
| `GET /api/certs?domain=` | crt.sh JSON | distinct names, first/last seen, issuers, count |
| `GET /api/wayback?url=` | web.archive.org CDX | first, last, count, sample snapshots |
| `POST /api/archive` | web.archive.org/save | archived_url or queued |
| `GET /api/urlscan?domain=` | urlscan.io search | recent scans: url, ip, asn, server, time, result |
| `GET /api/ip?ip=` | ipinfo + DoH PTR | org, asn, country, city, hostname, ptr |
| `GET /api/search?q=` | Brave Web Search | title, url, description, age |
| `GET /api/wikidata?q=` | Wikidata wbsearchentities | id, label, description, url |
| `GET /api/extract?url=` | direct fetch via HTMLRewriter | title, text (capped), links (capped), meta |
| `GET /api/queries?q=&type=` | none (pure) | operator variants, name-order permutations, RU/EN transliterations |

## WebMCP tools (registered on `document.modelContext`, fallback `navigator.modelContext`)

Always registered:
- `read_case` (readOnlyHint) -- full case JSON.
- `add_entity {type, value, notes?}` -- dedupes on type+value; returns id.
- `link_entities {from_id, to_id, rationale}` -- creates a `proposed` link; the human accepts or rejects in the UI.
- `attach_evidence {entity_ids[], url, quote, archive?}` -- stores evidence; optional archive-now.
- `search_web {query}`, `lookup_wikidata {query}`, `extract_page {url}`, `build_queries {text, type}`.
- `write_memo {markdown}` -- replaces the agent section of the findings memo; the human section is separate.
- `export_case` (readOnlyHint) -- markdown case file: entities, accepted links, evidence with URLs and capture times, memo.

Registered dynamically, only while an entity of that type exists on the board
(exercises `toolchange`):
- `pivot_domain {entity_id}` -- dns + rdap + certs + wayback + urlscan in parallel.
- `pivot_ip {entity_id}` -- rdap + ip.
- `pivot_url {entity_id}` -- wayback + extract, optional archive.

Every tool that returns third-party content carries `annotations.untrustedContentHint: true`
and wraps the payload as data with an explicit note that it is not instructions.
Return shape: `{ content: [{type: "text", text: <json>}], structuredContent: <object> }`.

## UI

Left: force graph of entities and accepted/proposed links. Right: tabs for Entities,
Links (accept/reject), Evidence, Readings, Memo (human textarea + agent section), Log.
Top: case title, tool count, export. Footer: WebMCP availability and how to enable it.
Third-party content renders inside a visibly marked untrusted panel.

## Security

- All upstream content is data. It is labelled untrusted in the envelope, the UI and
  the tool annotations. The demo includes a hosted page with an embedded instruction.
- Worker validates inputs (hostname, IP, URL shape), caps sizes, times out upstreams,
  and rate-limits per IP.
- No secrets in the repo. No user data leaves the browser except the selector being
  looked up, which goes to the same-origin Worker and then to the named upstream.

## Testing

- `node --test tests/` over pure functions: envelope, input validation, each sensor's
  response normaliser against fixtures, the query builder.
- Live smoke: deployed Worker answers each route for a known domain.
- Browser: tools enumerate and execute in Chrome with the WebMCP flag, driven through
  the DevTools MCP bridge, and in the ChatGPT desktop browser.

## Deployment

Cloudflare Workers with static assets. `wrangler deploy`. Public URL on workers.dev.
Repo: public on GitHub under the AMW Group identity, MIT licence at the top level.

## Demo (three minutes)

1. Why agents need tools, not screenshots (20 s).
2. Add one domain. Agent pivots: certs, RDAP, Wayback, urlscan. Board grows.
3. Agent proposes a link to a second domain found in certificate history with a rationale.
   Human rejects one weak link, accepts one.
4. Agent extracts a hosted page containing an embedded instruction; the board shows it
   as untrusted content; the agent attaches a quote as evidence with an archived copy.
5. Agent writes the findings memo. Human edits. Export the case file.
