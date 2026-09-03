# DevPost submission text and demo script

## Project name

OpenPivot

## Tagline

A cyber investigation workspace where the agent runs public-source collection and the analyst owns every case decision.

## Live URL

https://openpivot.edge-4q7m9x2k.workers.dev

Works in the ChatGPT desktop browser and in Chrome 149+ with `chrome://flags/#enable-webmcp-testing`.

## Repository

https://github.com/amwgrouporg/openpivot (MIT)

## Description (paste into DevPost)

**Why WebMCP fits this use case.** A technical infrastructure investigation is a pivot chain: a domain yields IPs,
certificate names and nameservers; each of those yields more. Today an analyst runs that
chain by hand across a dozen registry sites, and an agent left to browse those same sites
guesses at their UIs and misreads what it finds. Neither keeps provenance. WebMCP lets the
board expose the pivots as typed tools on the page the human is already looking at, so the
agent can run the chain while the investigator watches it happen, rules on every proposed relationship,
and records findings. The tools run in page JavaScript and call a same-origin Worker, so no
connector, no backend session, no separate agent integration.

**What gets better for the user.** One scoped workspace instead of fifteen tabs. Every collection result carries
its source URL and capture time. Every relationship carries a technical type, who proposed it, why, and any supporting citations; it stays
pending analyst review until an investigator accepts or rejects it. Third-party content is labelled untrusted in
the tool annotations, in the envelope and in the UI, so a page that tries to instruct the
agent remains visibly external data. The case exports as a Markdown file with the full evidence register and audit trail.

The investigation graph turns those case records into a working surface: three layouts, relationship-state
and entity-type filters, one- and two-hop neighborhoods, Case activity windows, visible-path tracing,
keyboard-addressable records, and a complete text alternative. Directional relationship types carry arrows;
symmetric associations do not. Collection rings and evidence counts remain record-state cues, not claims
about source truth.

**What investigators and agents can now do together.** The investigator sets the objective and scope. The agent proposes selectors,
runs public-source collection in parallel, queues relationships with rationales, and writes a visibly unvalidated draft. The
investigator triages leads, accepts or rejects relationships, records source relevance, documents collection gaps and methodology,
and writes findings the agent cannot touch. Adding a lead does not create a relationship, and accepting a relationship does not claim attribution.

**How WebMCP is used.** Ten tools are registered at load with `document.modelContext.registerTool`
and unregistered through `AbortController` plus `unregisterTool` when the browser provides it. Three pivot tools register only while an entity of
their type is on the board, so the browser fires `toolchange` as the investigation grows.
Only side-effect-free tools carry `readOnlyHint`; collection tools that add audit entries or case records do not.
Every tool that returns third-party content carries `untrustedContentHint`. Tool results return both `content` text and `structuredContent`. The
Worker is deterministic: it validates selectors, refuses private and loopback targets, times
out upstreams, rate-limits per client, and returns one envelope shape where any failure is
`indeterminate` rather than an empty result presented as a negative finding. Sensors: DNS over HTTPS, RDAP via the IANA
bootstrap with rdap.org and ARIN fallbacks, crt.sh with Cert Spotter fallback, Wayback CDX with
the availability API fallback, urlscan, ipinfo, Brave Search, Wikidata, and HTMLRewriter text
extraction. Case state lives in the browser; nothing is stored server-side.

**Built with.** JavaScript, Cloudflare Workers with static assets, D3, WebMCP.

## Video script (three minutes)

0:00 Title card. "Agents should not read registries by screenshot."
0:10 The empty Case overview. Define an objective and public-source scope. Point at "10 collection tools available".
0:20 In ChatGPT (or the Chrome inspector): "Add example.com to the case and pivot on it."
     Show add_entity, then the tool count ticking to 11 as pivot_domain appears. Show the
     pivot running in the entity workbench and the per-sensor collection states landing: DNS, RDAP,
     certs, Wayback, urlscan, each with a status badge and source link.
0:55 Agent: "Add the A record IP and pivot on it, then propose the link." Show pivot_ip and
     the typed relationship appearing dashed on the graph and as Pending analyst review.
     The investigator clicks Accept into case. The line goes solid and the cited DNS collection result stays on the card.
1:20 Agent proposes a second, weaker link (a urlscan page IP from an unrelated scan). Human
     reads the rationale, clicks Reject. Say why: the investigator owns the verdict.
1:40 Agent: "Add https://openpivot.edge-4q7m9x2k.workers.dev/demo/injected as a url and pivot
     on it with archive." Show pivot_url appear, then the extract collection result land in the entity
     workbench's isolated untrusted-source panel with the hidden "SYSTEM NOTICE TO AI AGENTS"
     text visible. Agent attaches a quote as evidence. Open Evidence and show the source,
     verbatim excerpt, relevance note, linked entity and archive state together.
2:15 Open Findings. The agent writes its clearly labelled, validation-required draft; the investigator adds supported observations,
     an outstanding collection gap, and a methodology note in separate human-owned fields.
2:35 Export. Open the Markdown: investigation definition, entities, typed relationships,
     evidence register, collection results, findings, and audit trail.
2:50 Close: "Public-source collection stays traceable. The agent runs the pivots. The investigator owns the case."

## Submission checklist

- [ ] DevPost: register, create project, paste description, add live URL, repo URL, video URL
- [ ] YouTube: upload the video as public, under the AMW Group channel
- [ ] Test the live URL in the ChatGPT desktop browser (Site tools in the address bar)
- [ ] In the ChatGPT desktop browser, open the console while the tools register and a pivot runs; confirm no Content-Security-Policy reports (red-team finding 37)
- [ ] Confirm the repo shows the MIT licence at the top and dated commits inside the window
