# OpenPivot Investigation Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform OpenPivot into a responsive local-first investigation cockpit that foregrounds analyst decisions while preserving its WebMCP and security contracts.

**Architecture:** Keep the no-build vanilla JavaScript application and Cloudflare Worker. Move persistence, run orchestration, WebMCP descriptors, pure view models, view rendering, and event routing behind explicit module boundaries so UI and tool actions use the same domain operations. Preserve the ten static tools and type-driven dynamic pivot registration.

**Tech Stack:** Browser-native ES modules, semantic HTML, CSS, vendored D3 7.9, Cloudflare Workers, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-openpivot-investigation-cockpit-design.md`

## Global Constraints

- Cases remain browser-local; no accounts, authentication, or server-side storage.
- No frontend framework, bundler, component library, icon package, or new runtime dependency.
- The existing ten static WebMCP tool names remain unchanged.
- An empty case exposes ten tools; adding its first domain exposes eleven including `pivot_domain`.
- Agent-created relationships remain proposed and cannot be accepted through a WebMCP tool.
- Untrusted third-party content is rendered as text and remains explicitly labeled.
- The app must remain usable at 480 × 640, 900 × 700, and 1440 × 900 viewports.
- Archive work must return a confirmed or indeterminate reading within 20 seconds at the application layer.
- Existing v1 local data must migrate without deleting the v1 value.
- Every task runs the targeted test first, then the full 51-test baseline plus new tests before commit.

---

## File Structure

Create:

- `public/repository.js` — v1-to-v2 migration and local case repository.
- `public/runs.js` — pivot specifications, run lifecycle, and bounded sensor orchestration.
- `public/tools.js` — static/dynamic WebMCP descriptors and tool synchronization.
- `public/ui/components.js` — safe shared HTML primitives.
- `public/ui/view-models.js` — pure overview, candidate, relationship, evidence, and source derivation.
- `public/ui/shell.js` — application shell, navigation, status, and workbench framing.
- `public/ui/overview.js` — review queue and recent activity.
- `public/ui/entities.js` — graph/list entity workspace and candidate/readings panels.
- `public/ui/relationships.js` — relationship review cards and composer.
- `public/ui/evidence.js` — evidence cards and attachment form.
- `public/ui/report.js` — analyst/agent memo and source summary.
- `public/ui/events.js` — delegated event and form routing.
- `tests/repository.test.js` — migration and local repository behavior.
- `tests/view-models.test.js` — review queue, filtering, sources, and candidate behavior.
- `tests/runs.test.js` — run lifecycle and archive time budget.
- `tests/tools.test.js` — tool-count and compatibility contract.
- `tests/ui-contract.test.js` — static semantic, responsive, and safety contract checks.

Modify:

- `public/store.js` — v2 model fields, candidate dismissal, citations, completed runs, undoable removal, JSON import/export.
- `public/app.js` — reduce to bootstrap, shared domain operations, and dependency wiring.
- `public/graph.js` — stable positions, edge selection, filters, reduced motion, semantic snapshot.
- `public/index.html` — new shell landmarks and templates.
- `public/styles.css` — design tokens, responsive cockpit, cards, sheets, focus, and motion.
- `src/sensors/wayback.js` — enforce archive submission budget below 20 seconds.
- `tests/sensors.test.js` — archive timeout regression.
- `docs/SUBMISSION.md` — update demonstration flow only after final live verification.

---

### Task 1: Versioned local repository and v2 case model

**Files:**
- Create: `public/repository.js`
- Modify: `public/store.js`
- Create: `tests/repository.test.js`
- Modify: `tests/validate.test.js`

**Interfaces:**
- Produces: `migrateCaseV1(value) -> CaseV2`, `createLocalCaseRepository(storage) -> CaseRepository`.
- Produces: `newCase(title)`, `dismissCandidate(caseData, key)`, `restoreCandidate(caseData, key)`, `removeEntity(caseData, id, actor) -> snapshot`, `restoreRemoval(caseData, snapshot)`, `addCompletedRun(caseData, run)`.
- `CaseRepository` exposes `load()`, `save(caseData)`, `create(title)`, `importJson(text)`, and `exportJson(caseData)`.

- [ ] **Step 1: Write failing migration and repository tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { migrateCaseV1, createLocalCaseRepository } from "../public/repository.js";

test("v1 migration copies records and initializes v2 cockpit state", () => {
  const oldCase = { version: 1, id: "case_1", title: "Legacy", entities: [], links: [], evidence: [], readings: [], memo: { human: "", agent: "", agent_updated_at: null }, log: [] };
  const next = migrateCaseV1(oldCase);
  assert.equal(next.version, 2);
  assert.deepEqual(next.ui, { selected_entity_id: null, graph_positions: {}, dismissed_candidates: [] });
  assert.deepEqual(next.runs, []);
  assert.notEqual(next, oldCase);
});

test("repository keeps v1 backup until v2 save succeeds", () => {
  const values = new Map([["openpivot.case.v1", JSON.stringify({ version: 1, id: "case_1", title: "Legacy", entities: [], links: [], evidence: [], readings: [], memo: { human: "", agent: "", agent_updated_at: null }, log: [] })]]);
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
  const repo = createLocalCaseRepository(storage);
  assert.equal(repo.load().version, 2);
  assert.ok(values.has("openpivot.case.v1"));
  assert.ok(values.has("openpivot.case.v2"));
});
```

- [ ] **Step 2: Run the targeted tests and verify the missing-module failure**

Run: `node --test tests/repository.test.js`  
Expected: FAIL because `public/repository.js` does not exist.

- [ ] **Step 3: Implement v2 constructors, migration, repository, dismissal, citations, runs, and removal snapshots**

```js
export const CASE_KEY_V1 = "openpivot.case.v1";
export const CASE_KEY_V2 = "openpivot.case.v2";

export function migrateCaseV1(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.entities)) throw new Error("invalid v1 case");
  return structuredClone({ ...input, version: 2, ui: { selected_entity_id: null, graph_positions: {}, dismissed_candidates: [] }, runs: [], links: input.links.map((link) => ({ ...link, citations: link.citations ?? [] })) });
}
```

Use JSON cloning as a fallback when `structuredClone` is unavailable in the test runtime. `load()` first accepts valid v2 data; otherwise it migrates valid v1 data, saves v2, and leaves v1 untouched. `save()` validates version 2 before writing. `importJson()` accepts only a complete v1 or v2 case and returns v2.

- [ ] **Step 4: Run repository and store tests**

Run: `node --test tests/repository.test.js tests/validate.test.js`  
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `node --test tests/*.test.js`  
Expected: all tests pass.

```bash
git add public/repository.js public/store.js tests/repository.test.js tests/validate.test.js
git commit -m "feat: add versioned local case repository"
```

### Task 2: Pure cockpit view models and citation-aware export

**Files:**
- Create: `public/ui/view-models.js`
- Modify: `public/store.js`
- Create: `tests/view-models.test.js`

**Interfaces:**
- Consumes: v2 `caseData` from Task 1.
- Produces: `candidateKey(entityId, candidate)`, `visibleCandidates(caseData, candidateMap, entityId)`, `buildReviewQueue(caseData, candidateMap)`, `relationshipView(caseData, link)`, `reportSources(caseData)`, `exportMarkdown(caseData)`.

- [ ] **Step 1: Write failing tests for queue priority, dismissal, citations, and export**

```js
test("review queue orders proposals before indeterminate readings and candidates", () => {
  const queue = buildReviewQueue(caseData, new Map([["ent_1", [{ type: "ip", value: "192.0.2.1", why: "A record" }]]]));
  assert.deepEqual(queue.map((item) => item.kind), ["relationship", "reading", "candidate"]);
});

test("dismissed candidate keys are omitted and restorable", () => {
  caseData.ui.dismissed_candidates = [candidateKey("ent_1", { type: "ip", value: "192.0.2.1" })];
  assert.deepEqual(visibleCandidates(caseData, candidates, "ent_1"), []);
});

test("relationship view resolves reading citations", () => {
  const view = relationshipView(caseData, { from: "ent_1", to: "ent_2", citations: [{ kind: "reading", id: "rdg_1" }] });
  assert.equal(view.citations[0].source_url, "https://cloudflare-dns.com/dns-query?name=example.com");
});
```

- [ ] **Step 2: Run targeted tests and verify missing exports**

Run: `node --test tests/view-models.test.js`  
Expected: FAIL with missing module or export errors.

- [ ] **Step 3: Implement deterministic pure derivations**

Review order is proposed relationships, indeterminate readings, visible candidates, then completed runs. Candidate keys use `${entityId}:${type}:${normalizedValue}`. Citation resolution never throws for a stale id; it returns an explicit missing citation record so exports remain readable.

- [ ] **Step 4: Extend link and evidence operations compatibly**

`addLink` accepts optional `citations = []`, validates `{kind,id}` pairs against readings/evidence, and keeps old calls valid. `addEvidence` accepts optional `reading_id`. `exportMarkdown` adds citation source lines beneath relationships without changing existing sections.

- [ ] **Step 5: Run targeted and full tests, then commit**

Run: `node --test tests/view-models.test.js tests/validate.test.js`  
Expected: PASS.

Run: `node --test tests/*.test.js`  
Expected: all tests pass.

```bash
git add public/ui/view-models.js public/store.js tests/view-models.test.js
git commit -m "feat: derive cockpit review and source views"
```

### Task 3: Run orchestration and bounded archive status

**Files:**
- Create: `public/runs.js`
- Modify: `src/sensors/wayback.js`
- Create: `tests/runs.test.js`
- Modify: `tests/sensors.test.js`

**Interfaces:**
- Consumes: `sensor(route, params, options)` and store operations.
- Produces: `PIVOT_SPECS`, `createRun(entity, actor, specs)`, `runPivot({caseData, entity, actor, specs, sensorCall, onUpdate})`, and `ARCHIVE_BUDGET_MS = 18_000`.
- A completed run returns `{run, readings, candidates}` and invokes `onUpdate(run)` on each state transition.

- [ ] **Step 1: Write failing run lifecycle tests with a fake sensor**

```js
test("runPivot reports queued, running, and terminal sensor states", async () => {
  const updates = [];
  const result = await runPivot({ caseData, entity, actor: "agent", specs: [{ route: "dns", params: { name: "example.com" } }], sensorCall: async () => okEnvelope("dns"), onUpdate: (run) => updates.push(structuredClone(run)) });
  assert.equal(updates[0].sensors[0].status, "queued");
  assert.equal(updates.at(-1).sensors[0].status, "ok");
  assert.equal(result.run.status, "ok");
});

test("mixed terminal states make the run indeterminate", async () => {
  const result = await runPivot({ caseData, entity, actor: "human", specs: twoSpecs, sensorCall: fakeMixedSensor, onUpdate() {} });
  assert.equal(result.run.status, "indeterminate");
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --test tests/runs.test.js tests/sensors.test.js`  
Expected: FAIL because run orchestration and the archive budget are absent.

- [ ] **Step 3: Implement run orchestration without changing sensor envelopes**

Create all sensor states as queued, mark each running before invoking its call, and settle each independently. Persist only the final run. Preserve parallel execution with `Promise.all`.

- [ ] **Step 4: Bound archive submission to 18 seconds**

Use the existing timeout helper in `src/sensors/wayback.js` with `ARCHIVE_BUDGET_MS`. On timeout, keep `submitted: true` only when the request was initiated, include the check URL, and return `indeterminate`. Do not retry automatically.

- [ ] **Step 5: Run targeted and full tests, then commit**

Run: `node --test tests/runs.test.js tests/sensors.test.js`  
Expected: PASS.

Run: `node --test tests/*.test.js`  
Expected: all tests pass.

```bash
git add public/runs.js src/sensors/wayback.js tests/runs.test.js tests/sensors.test.js
git commit -m "feat: track pivots and bound archive latency"
```

### Task 4: Extract WebMCP descriptors and preserve tool contracts

**Files:**
- Create: `public/tools.js`
- Modify: `public/app.js`
- Create: `tests/tools.test.js`

**Interfaces:**
- Consumes: case accessors, domain operations, `runPivot`, and the existing registry.
- Produces: `createToolset(dependencies) -> { staticTools, dynamicTools, syncDynamicTools }`.
- `dependencies` contains `getCase`, `persist`, `resolveEntity`, `runDomain`, `runIp`, `runUrl`, `archiveUrl`, and domain operations.

- [ ] **Step 1: Write failing WebMCP contract tests**

```js
test("empty case exposes the original ten static tool names", () => {
  const toolset = createToolset(fakeDependencies(emptyCase));
  assert.deepEqual(toolset.staticTools.map((tool) => tool.name), ["read_case", "add_entity", "link_entities", "attach_evidence", "search_web", "lookup_wikidata", "extract_page", "build_queries", "write_memo", "export_case"]);
});

test("domain presence adds only pivot_domain", () => {
  const names = synchronizedNames(caseWithDomain);
  assert.equal(names.length, 11);
  assert.ok(names.includes("pivot_domain"));
});

test("legacy link and evidence inputs remain valid", async () => {
  assert.equal((await callTool("link_entities", legacyLinkInput)).structuredContent.link.status, "proposed");
  assert.equal((await callTool("attach_evidence", legacyEvidenceInput)).structuredContent.evidence.url, legacyEvidenceInput.url);
});
```

- [ ] **Step 2: Run tests and verify missing-module failure**

Run: `node --test tests/tools.test.js`  
Expected: FAIL because `public/tools.js` does not exist.

- [ ] **Step 3: Move descriptors without semantic changes, then add optional citation inputs**

Keep the current schemas and annotations. Add optional `citations` to `link_entities` and optional `reading_id` to `attach_evidence`. Keep `read_case`, pivot results, and `export_case` shapes backward compatible.

- [ ] **Step 4: Replace app-local registration with `createToolset` wiring**

`public/app.js` owns case access and persistence, creates the toolset, registers the ten static descriptors in order, then synchronizes dynamic tools. Existing registry race protections stay in `public/webmcp.js`.

- [ ] **Step 5: Run targeted and full tests, then commit**

Run: `node --test tests/tools.test.js tests/redteam_fixes.test.js`  
Expected: PASS.

Run: `node --test tests/*.test.js`  
Expected: all tests pass.

```bash
git add public/tools.js public/app.js tests/tools.test.js
git commit -m "refactor: isolate WebMCP tool descriptors"
```

### Task 5: Shared UI primitives and responsive shell

**Files:**
- Create: `public/ui/components.js`
- Create: `public/ui/shell.js`
- Modify: `public/index.html`
- Replace: `public/styles.css`
- Create: `tests/ui-contract.test.js`

**Interfaces:**
- Produces safe primitives: `escapeHtml`, `safeLink`, `typeBadge`, `statusBadge`, `actorBadge`, `sectionHeader`, `sourceHost`, and `icon`.
- Produces `renderShell({caseData, activeView, counts, webmcpState, workbenchHtml, contentHtml})` and `updateShell(root, model)`.

- [ ] **Step 1: Write failing UI contract tests**

```js
test("shell contains required landmarks and five primary destinations", () => {
  const html = readFileSync("public/index.html", "utf8");
  for (const landmark of ["data-app-shell", "data-primary-nav", "data-main-surface", "data-workbench", "data-live-status"]) assert.match(html, new RegExp(landmark));
  for (const view of ["overview", "entities", "relationships", "evidence", "report"]) assert.match(html, new RegExp(`data-view=\\"${view}\\"`));
});

test("styles define all three responsive targets and reduced motion", () => {
  const css = readFileSync("public/styles.css", "utf8");
  assert.match(css, /@media \(max-width: 1179px\)/);
  assert.match(css, /@media \(max-width: 759px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("safeLink refuses non-http protocols", () => {
  assert.doesNotMatch(safeLink("javascript:alert(1)"), /<a/);
});
```

- [ ] **Step 2: Run UI contract tests and verify failure**

Run: `node --test tests/ui-contract.test.js`  
Expected: FAIL because the new landmarks and modules are absent.

- [ ] **Step 3: Implement semantic shell and safe primitives**

The static document contains the header, primary navigation, main surface, optional workbench, bottom navigation, persistent notices, live status, and modal/toast hosts. Keep user-provided values out of static HTML; render them through `escapeHtml`.

- [ ] **Step 4: Implement the visual tokens and three layouts**

Define graphite-blue surfaces, cool-slate elevations, electric-blue focus, readable type colors, distinct evidence and untrusted treatments, 32/40 px controls, focus-visible rings, and reduced-motion overrides. At narrow width, show bottom navigation and full-width cards; remove table dependencies from core flows.

- [ ] **Step 5: Run contract and full tests, then commit**

Run: `node --test tests/ui-contract.test.js`  
Expected: PASS.

Run: `node --test tests/*.test.js`  
Expected: all tests pass.

```bash
git add public/index.html public/styles.css public/ui/components.js public/ui/shell.js tests/ui-contract.test.js
git commit -m "feat: build responsive investigation cockpit shell"
```

### Task 6: Overview queue and entity workbench

**Files:**
- Create: `public/ui/overview.js`
- Create: `public/ui/entities.js`
- Create: `public/ui/events.js`
- Modify: `public/app.js`
- Modify: `tests/view-models.test.js`
- Modify: `tests/ui-contract.test.js`

**Interfaces:**
- Consumes: Task 2 view models, Task 3 run updates, Task 5 components.
- Produces: `renderOverview(model)`, `renderEntities(model)`, `createEventRouter(actions)`.
- App actions include `selectEntity`, `runPivot`, `addCandidate`, `addAndProposeCandidate`, `dismissCandidate`, `restoreCandidate`, `editEntityNotes`, `requestRemoveEntity`, and `undoRemoval`.

- [ ] **Step 1: Add failing view and routing tests**

```js
test("overview renders proposed relationships before lower-priority sections", () => {
  const html = renderOverview(fixtureModel);
  assert.ok(html.indexOf("Needs review") < html.indexOf("Indeterminate readings"));
});

test("candidate add-and-propose remains proposed", async () => {
  await actions.addAndProposeCandidate("ent_domain", candidate);
  assert.equal(caseData.links.at(-1).status, "proposed");
});

test("busy state disables only the selected entity pivot", () => {
  const html = renderEntities(modelWithActiveRun);
  assert.match(html, /data-action="run-pivot"[^>]*disabled/);
  assert.match(html, /data-view-action="relationships"/);
});
```

- [ ] **Step 2: Run targeted tests and verify failure**

Run: `node --test tests/view-models.test.js tests/ui-contract.test.js`  
Expected: FAIL because the views and routes do not exist.

- [ ] **Step 3: Implement Overview with actionable empty states**

Render proposed relationships, indeterminate readings, visible candidates, and recent runs. Each item routes to its entity or relationship. Empty cases show the guided selector composer and the WebMCP tool-count explanation.

- [ ] **Step 4: Implement entity browser, workbench, sensor progress, and candidate actions**

The workbench shows identity, notes, pivot action, per-sensor state, reading cards, candidate groups, and destructive action disclosure. “Add” adds only the entity. “Add and propose link” adds the entity and a proposed relationship with its discovery rationale. “Dismiss” stores the candidate key and exposes a restore control.

- [ ] **Step 5: Wire delegated events and persistent errors**

Forms show errors beside their inputs. Reading errors remain until dismissed or replaced. Entity removal opens a modal listing the number of affected links/readings/evidence items and offers undo after completion.

- [ ] **Step 6: Run targeted and full tests, then commit**

Run: `node --test tests/view-models.test.js tests/ui-contract.test.js`  
Expected: PASS.

Run: `node --test tests/*.test.js`  
Expected: all tests pass.

```bash
git add public/app.js public/ui/overview.js public/ui/entities.js public/ui/events.js tests/view-models.test.js tests/ui-contract.test.js
git commit -m "feat: add review queue and entity workbench"
```

### Task 7: Relationship, evidence, and report workspaces

**Files:**
- Create: `public/ui/relationships.js`
- Create: `public/ui/evidence.js`
- Create: `public/ui/report.js`
- Modify: `public/ui/events.js`
- Modify: `public/app.js`
- Modify: `tests/view-models.test.js`
- Modify: `tests/ui-contract.test.js`

**Interfaces:**
- Produces: `renderRelationships(model)`, `renderEvidence(model)`, `renderReport(model)`.
- Adds actions `setRelationshipStatus`, `startEvidenceFromReading`, `attachEvidence`, `saveAnalystMemo`, `exportCase`, and `importCase`.

- [ ] **Step 1: Add failing tests for review cards, evidence prefill, and report separation**

```js
test("proposed relationship card exposes rationale, citations, accept, and reject", () => {
  const html = renderRelationships(modelWithProposal);
  assert.match(html, /DNS reading/);
  assert.match(html, /data-action="accept-relationship"/);
  assert.match(html, /data-action="reject-relationship"/);
});

test("reading evidence flow prefills source and entity but not quote", () => {
  const form = evidenceDraftFromReading(caseData, "rdg_1");
  assert.equal(form.url, reading.source_url);
  assert.deepEqual(form.entity_ids, [reading.entity_id]);
  assert.equal(form.quote, "");
});

test("report renders analyst editor separately from agent material", () => {
  const html = renderReport(reportModel);
  assert.match(html, /id="memo-human"/);
  assert.match(html, /data-agent-report/);
  assert.match(html, /Unreviewed agent draft/);
});
```

- [ ] **Step 2: Run targeted tests and verify failure**

Run: `node --test tests/view-models.test.js tests/ui-contract.test.js`  
Expected: FAIL on missing views and evidence draft behavior.

- [ ] **Step 3: Implement relationship review cards and citation display**

Cards show both entities, actor, time, rationale, citation source and summary, status, and visible review controls. Rejected records remain accessible under a filter.

- [ ] **Step 4: Implement evidence cards and reading-to-evidence flow**

Evidence source and entity are prefilled from a reading; the exact quote remains required. Archive state uses `not requested`, `confirmed`, or `submitted; confirmation pending` copy.

- [ ] **Step 5: Implement report workspace, source summary, import, and export**

The analyst textarea autosaves without re-rendering on every keystroke. Agent text is rendered as escaped prose with an “Unreviewed agent draft” provenance label. JSON import is available from the Report overflow menu; Markdown and JSON export are explicit separate actions.

- [ ] **Step 6: Run targeted and full tests, then commit**

Run: `node --test tests/view-models.test.js tests/ui-contract.test.js`  
Expected: PASS.

Run: `node --test tests/*.test.js`  
Expected: all tests pass.

```bash
git add public/app.js public/ui/events.js public/ui/relationships.js public/ui/evidence.js public/ui/report.js tests/view-models.test.js tests/ui-contract.test.js
git commit -m "feat: add review evidence and report workspaces"
```

### Task 8: Stable graph positions, filters, and accessible graph alternative

**Files:**
- Modify: `public/graph.js`
- Modify: `public/ui/entities.js`
- Modify: `public/app.js`
- Create: `tests/graph.test.js`

**Interfaces:**
- `createGraph(svg, options)` adds `onSelectEntity`, `onSelectLink`, `onPositionsChange`, and `reducedMotion` callbacks/options.
- Produces methods `update(caseData, filters)`, `fit()`, `zoom(factor)`, `resetLayout()`, `selectEntity(id)`, and `selectLink(id)`.
- Produces `graphListModel(caseData, filters)` for the semantic alternative.

- [ ] **Step 1: Write failing pure graph-model tests**

```js
test("graph model hides rejected links by default", () => {
  assert.deepEqual(graphListModel(caseWithRejected, {}).links.map((link) => link.status), ["accepted", "proposed"]);
});

test("saved graph positions are applied to nodes", () => {
  const model = graphListModel(caseWithPosition, {});
  assert.deepEqual(model.nodes.find((node) => node.id === "ent_1").position, { x: 120, y: 80 });
});

test("connected filter retains selection and adjacent nodes", () => {
  assert.deepEqual(graphListModel(caseData, { connectedTo: "ent_1" }).nodes.map((node) => node.id).sort(), ["ent_1", "ent_2"]);
});
```

- [ ] **Step 2: Run graph tests and verify missing exports**

Run: `node --test tests/graph.test.js`  
Expected: FAIL because `graphListModel` and the new API are absent.

- [ ] **Step 3: Implement pure graph filtering and position mapping**

Export `graphListModel` independently of D3. Apply type, status, and connected-to-selection filters. Keep rejected links hidden unless requested.

- [ ] **Step 4: Update D3 behavior and persistence callbacks**

Initialize nodes from saved positions. Debounce settled drag positions through `onPositionsChange`. Add link click targets, selected entity/link classes, reset layout, and immediate transforms when reduced motion is active.

- [ ] **Step 5: Render the synchronized semantic graph list**

The list exposes every visible entity and relationship as buttons that open the same workbench/review card. It remains visually compact but available to screen readers and keyboard users.

- [ ] **Step 6: Run targeted and full tests, then commit**

Run: `node --test tests/graph.test.js tests/ui-contract.test.js`  
Expected: PASS.

Run: `node --test tests/*.test.js`  
Expected: all tests pass.

```bash
git add public/graph.js public/app.js public/ui/entities.js tests/graph.test.js
git commit -m "feat: stabilize and filter the investigation graph"
```

### Task 9: Browser validation, accessibility, documentation, and live contract

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`
- Modify: `tests/ui-contract.test.js`
- Modify: `docs/SUBMISSION.md`
- Create: `docs/QA-investigation-cockpit.md`

**Interfaces:**
- No new product interfaces. This task verifies and documents the completed system.

- [ ] **Step 1: Add final static accessibility assertions**

```js
test("app exposes live status, dialog hosts, focus styles, and text status labels", () => {
  const html = readFileSync("public/index.html", "utf8");
  const css = readFileSync("public/styles.css", "utf8");
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-modal-host/);
  assert.match(css, /:focus-visible/);
  for (const label of ["ok", "indeterminate", "proposed", "accepted", "rejected"]) assert.match(css + html, new RegExp(label));
});
```

- [ ] **Step 2: Run the complete automated suite**

Run: `node --test tests/*.test.js`  
Expected: all tests pass with zero failures.

- [ ] **Step 3: Start the local Worker and validate three viewport widths**

Run: `pnpm exec wrangler dev --local --port 8787`.

At 480 × 640, 900 × 700, and 1440 × 900 verify:

- primary navigation is usable;
- Overview exposes the next action;
- entity pivot actions remain visible;
- workbench/sheet opens and closes;
- no core action requires horizontal scrolling;
- untrusted source material is visually distinct;
- keyboard focus is visible;
- reduced-motion mode removes nonessential transitions.

Save screenshots under `docs/screenshots/cockpit-480.png`, `cockpit-900.png`, and `cockpit-1440.png`.

- [ ] **Step 4: Run the complete local WebMCP flow**

Verify the exact sequence:

1. Empty case exposes ten static tools.
2. Add `example.com`; tool count becomes eleven and `pivot_domain` appears.
3. Pivot the domain and add its first A-record IP.
4. Pivot the IP and propose a DNS-cited relationship.
5. Accept through the human UI.
6. Add and pivot `/demo/injected`; do not follow its text.
7. Attach RDAP evidence, write both memo sections, and export.

- [ ] **Step 5: Record the QA results and update the demo script**

`docs/QA-investigation-cockpit.md` records automated totals, viewport checks, WebMCP counts, sensor results, any indeterminate readings, and screenshot paths. Update `docs/SUBMISSION.md` menu/view names without changing factual security claims.

- [ ] **Step 6: Run final verification and commit**

Run: `node --test tests/*.test.js`  
Expected: all tests pass with zero failures.

Run: `git diff --check`  
Expected: no output.

```bash
git add public/index.html public/styles.css public/app.js tests/ui-contract.test.js docs/SUBMISSION.md docs/QA-investigation-cockpit.md docs/screenshots
git commit -m "docs: verify investigation cockpit release"
```

### Task 10: Final branch review

**Files:**
- Review all files changed by Tasks 1–9.

**Interfaces:**
- No new interfaces. This is the release gate.

- [ ] **Step 1: Inspect the complete branch diff**

Run: `git diff --stat main...HEAD` and `git diff main...HEAD` from the isolated implementation worktree.  
Expected: only specification, plan, implementation, tests, screenshots, and QA documentation are present.

- [ ] **Step 2: Re-run the full suite**

Run: `node --test tests/*.test.js`  
Expected: all tests pass with zero failures.

- [ ] **Step 3: Re-check repository state**

Run: `git status --short --branch` and `git log --oneline --decorate -12`.  
Expected: a clean worktree and focused commits for each completed task.

- [ ] **Step 4: Present the implementation for integration**

Summarize behavioral changes, automated test totals, viewport evidence, live WebMCP results, archive-status behavior, and the exact branch or worktree location. Do not merge, push, or deploy without separate user authorization.

