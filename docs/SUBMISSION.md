# DevPost submission text and demo script

## Project name

OpenPivot

## Tagline

An investigation board where the agent runs the pivots and the human keeps the ledger.

## Live URL

https://openpivot.edge-4q7m9x2k.workers.dev

Works in the ChatGPT desktop browser and in Chrome 149+ with `chrome://flags/#enable-webmcp-testing`.

## Repository

https://github.com/amwgrouporg/openpivot (MIT)

## Description (paste into DevPost)

**Why WebMCP fits this use case.** An investigation is a pivot chain: a domain yields IPs,
certificate names and nameservers; each of those yields more. Today an analyst runs that
chain by hand across a dozen registry sites, and an agent left to browse those same sites
guesses at their UIs and misreads what it finds. Neither keeps provenance. WebMCP lets the
board expose the pivots as typed tools on the page the human is already looking at, so the
agent can run the chain while the human watches it happen, rules on every proposed link,
and edits the memo. The tools run in page JavaScript and call a same-origin Worker, so no
connector, no backend session, no separate agent integration.

**What gets better for the user.** One board instead of fifteen tabs. Every reading carries
its source URL and capture time. Every link carries who proposed it and why, and stays
"proposed" until a person accepts or rejects it. Third-party content is labelled untrusted in
the tool annotations, in the envelope and in the UI, so a page that tries to instruct the
agent is visibly data. The case exports as a markdown file with the full ledger.

**What humans and agents can now do together.** The agent proposes selectors, runs sensors in
parallel, proposes links with rationales and drafts its own section of the findings memo. The
human seeds the case, adds or rejects candidates, accepts or rejects links, and writes the
analyst section the agent cannot touch. Both actors are first-class on the board: entities
added by the agent draw with a dashed ring; every record says `human` or `agent`.

**How WebMCP is used.** Ten tools are registered at load with `document.modelContext.registerTool`
and unregistered through `AbortController`. Three pivot tools register only while an entity of
their type is on the board, so the browser fires `toolchange` as the investigation grows.
Read-only tools carry `readOnlyHint`; every tool that returns third-party content carries
`untrustedContentHint`. Tool results return both `content` text and `structuredContent`. The
Worker is deterministic: it validates selectors, refuses private and loopback targets, times
out upstreams, rate-limits per client, and returns one envelope shape where any failure is
`indeterminate` rather than an empty result. Sensors: DNS over HTTPS, RDAP via the IANA
bootstrap with rdap.org and ARIN fallbacks, crt.sh with Cert Spotter fallback, Wayback CDX with
the availability API fallback, urlscan, ipinfo, Brave Search, Wikidata, and HTMLRewriter text
extraction. Case state lives in the browser; nothing is stored server-side.

**Built with.** JavaScript, Cloudflare Workers with static assets, D3, WebMCP.

## Video script (three minutes)

0:00 Title card. "Agents should not read registries by screenshot."
0:10 The Overview, empty. Say what it is in one sentence. Point at "10 site tools ready".
0:20 In ChatGPT (or the Chrome inspector): "Add example.com to the case and pivot on it."
     Show add_entity, then the tool count ticking to 11 as pivot_domain appears. Show the
     pivot running in the entity workbench and the per-sensor states landing: DNS, RDAP,
     certs, Wayback, urlscan, each with a status badge and source link.
0:55 Agent: "Add the A record IP and pivot on it, then propose the link." Show pivot_ip and
     the proposed link appearing dashed on the graph and in the Relationships review queue.
     Human clicks Accept. The line goes solid and the cited DNS reading stays on the card.
1:20 Agent proposes a second, weaker link (a urlscan page IP from an unrelated scan). Human
     reads the rationale, clicks Reject. Say why: the human owns the verdict.
1:40 Agent: "Add https://openpivot.edge-4q7m9x2k.workers.dev/demo/injected as a url and pivot
     on it with archive." Show pivot_url appear, then the extract reading land in the entity
     workbench's isolated untrusted-source panel with the hidden "SYSTEM NOTICE TO AI AGENTS"
     text visible. Agent attaches a quote as evidence. Open Evidence and show the source,
     exact quote, linked entity and archive state together.
2:15 Open Report. Agent writes its clearly labelled draft; human types two lines in the
     separate analyst conclusions section.
2:35 Export. Open the markdown: entities, links with who asserted them, evidence with
     capture times, readings with source URLs, both memo sections, log.
2:50 Close: "Every hop provenanced. The agent runs the chain. The human keeps the ledger."

## Submission checklist

- [ ] DevPost: register, create project, paste description, add live URL, repo URL, video URL
- [ ] YouTube: upload the video as public, under the AMW Group channel
- [ ] Test the live URL in the ChatGPT desktop browser (Site tools in the address bar)
- [ ] Confirm the repo shows the MIT licence at the top and dated commits inside the window
