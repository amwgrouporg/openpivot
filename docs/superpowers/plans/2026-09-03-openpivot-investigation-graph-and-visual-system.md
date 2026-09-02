# OpenPivot Investigation Graph and Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an analyst-grade investigation graph and coordinated premium visual system that expose technical direction, source support, collection state, graph paths, neighborhoods, layouts, and local case activity without overstating what the evidence proves.

**Architecture:** Add a DOM-free `graph-model.js` analysis boundary, keep D3/SVG rendering in `graph.js`, and isolate control markup in `ui/graph-controls.js`. Persist only stable graph preferences in the v2 repository; keep paths, hover, zoom, and tooltips transient in `app.js`. Refine the shared shell and CSS after the analytical behaviors are complete.

**Tech Stack:** JavaScript ES modules, D3 7.9 SVG, HTML/CSS, browser localStorage repository, Node 24 test runner, Cloudflare Wrangler, ChatGPT in-app browser QA.

**Spec:** `docs/superpowers/specs/2026-09-03-openpivot-investigation-graph-and-visual-system-design.md`

## Global Constraints

- Preserve the ten static WebMCP tools and dynamic `pivot_domain`, `pivot_ip`, and `pivot_url` contract.
- Keep graph analysis local; graph interactions make no network request and do not mutate case records.
- Never present retrieval, acceptance, co-occurrence, or a path as verification, confidence, or attribution.
- Preserve investigator ownership of relationship verdicts and investigator-authored Findings fields.
- Use existing D3/SVG with no new runtime dependency.
- Target 250 visible entities and 500 visible relationships with level-of-detail behavior.
- Keep v1 migration, older-v2 normalization, recovery, JSON round trips, positions, removal/undo, and import/export compatible.
- Preserve keyboard, screen-reader, reduced-motion, and 480-pixel behavior.
- Persist only `graph_layout`, `graph_hops`, `graph_activity_window`, and `graph_labels`.

---

### Task 1: Pure graph analysis model

**Files:**
- Create: `public/graph-model.js`
- Modify: `public/graph.js`
- Create: `tests/graph-model.test.js`
- Modify: `tests/graph.test.js`

**Interfaces:**
- Consumes: v2 case records and explicit reference timestamps.
- Produces: `nodeMetadata(caseData)`, `neighborhoodIds(links, seedId, depth)`, `shortestPath(links, startId, endId)`, `connectedComponents(nodes, links)`, `filterGraph(caseData, filters)`, `parallelEdgeOffsets(links)`, `layoutTargets(nodes, links, options)`, and `labelModeForCount(count, requested)`.

- [ ] **Step 1: Write failing metadata, neighborhood, and path tests**

```js
test("node metadata prioritizes inconclusive collection and counts evidence", () => {
  const c = fixtureCase();
  c.readings.push({ id: "r1", entity_id: "a", status: "ok", fetched_at: "2026-09-03T10:00:00Z" });
  c.readings.push({ id: "r2", entity_id: "a", status: "indeterminate", fetched_at: "2026-09-03T11:00:00Z" });
  c.evidence.push({ id: "e1", entity_ids: ["a"], captured_at: "2026-09-03T12:00:00Z" });
  assert.deepEqual(nodeMetadata(c).get("a"), {
    collectionStatus: "indeterminate", evidenceCount: 1, relationshipCount: 2,
    lastCaseActivityAt: "2026-09-03T12:00:00Z",
  });
});

test("neighborhood and path traversal are undirected but preserve link ids", () => {
  const links = [{ id: "ab", from: "a", to: "b" }, { id: "bc", from: "b", to: "c" }];
  assert.deepEqual([...neighborhoodIds(links, "a", 1)].sort(), ["a", "b"]);
  assert.deepEqual([...neighborhoodIds(links, "a", 2)].sort(), ["a", "b", "c"]);
  assert.deepEqual(shortestPath(links, "a", "c"), { nodeIds: ["a", "b", "c"], linkIds: ["ab", "bc"] });
});

test("connected components retain isolated entities", () => {
  assert.deepEqual(connectedComponents([{ id: "a" }, { id: "b" }, { id: "c" }], [{ from: "a", to: "b" }]), [["a", "b"], ["c"]]);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/graph-model.test.js`

Expected: FAIL because `public/graph-model.js` does not exist.

- [ ] **Step 3: Implement metadata and one reusable breadth-first traversal**

```js
export function neighborhoodIds(links, seedId, depth) {
  const adjacency = buildAdjacency(links);
  const seen = new Set([seedId]);
  let frontier = [seedId];
  for (let hop = 0; hop < depth; hop += 1) {
    frontier = frontier.flatMap((id) => [...(adjacency.get(id) ?? [])]
      .map((edge) => edge.other).filter((id) => !seen.has(id) && seen.add(id)));
  }
  return seen;
}
```

`shortestPath` and `connectedComponents` use the same adjacency structure. The path stores predecessor node/link pairs, returns the ordered shortest route, and returns `null` when either endpoint is absent or disconnected. Components sort by size descending and then by first id for deterministic density summaries.

- [ ] **Step 4: Write failing activity, offset, layout, and density tests**

```js
test("case activity is deterministic and marks contextual edges", () => {
  const result = filterGraph(fixtureCase(), { activityWindow: "24h", now: "2026-09-03T12:00:00Z" });
  assert.deepEqual(result.nodes.map((n) => n.id).sort(), ["a", "b"]);
  assert.equal(result.links.find((l) => l.id === "old-context").contextual, true);
});

test("parallel edge offsets are stable", () => {
  const links = [
    { id: "one", from: "a", to: "b", relationship_type: "resolves_to" },
    { id: "two", from: "a", to: "b", relationship_type: "references" },
    { id: "three", from: "b", to: "a", relationship_type: "redirects_to" },
  ];
  assert.deepEqual([...parallelEdgeOffsets(links)], [["one", -18], ["three", 0], ["two", 18]]);
});

test("automatic label density follows the documented thresholds", () => {
  assert.equal(labelModeForCount(59, "auto"), "all");
  assert.equal(labelModeForCount(60, "auto"), "neighbors");
  assert.equal(labelModeForCount(151, "auto"), "focus");
});
```

- [ ] **Step 5: Run RED, then implement the remaining model**

Run: `node --test tests/graph-model.test.js`

Expected: FAIL for missing exports.

`filterGraph` accepts `{ types, statuses, includeRejected, selectedId, hops, activityWindow, now }`; applies status/type before neighborhood; uses exact windows 86,400,000 ms, 604,800,000 ms, and 2,592,000,000 ms; and returns:

```js
{
  nodes: [{ ...entity, metadata, position }],
  links: [{ ...link, directional, curveOffset, contextual }],
  density: { nodeCount, linkCount, reduceLabels, message },
}
```

`layoutTargets` supports `force`, `lanes`, and `radial`; lanes use type order domain, url, ip, org, document, claim; radial rings use breadth-first depth from the selected entity. `parallelEdgeOffsets` sorts by unordered endpoint pair, direction, type, and id before applying 18-pixel increments. Re-export `graphListModel` from `graph.js` as a compatibility wrapper.

- [ ] **Step 6: Verify GREEN and commit**

Run: `node --test tests/graph-model.test.js tests/graph.test.js`

Expected: PASS.

```bash
git add public/graph-model.js public/graph.js tests/graph-model.test.js tests/graph.test.js
git commit -m "feat: add investigation graph analysis model"
```

---

### Task 2: Persisted graph preferences and recovery

**Files:**
- Modify: `public/repository.js`
- Modify: `tests/repository.test.js`

**Interfaces:**
- Consumes: optional v2 UI preferences.
- Produces: valid `graph_layout`, `graph_hops`, `graph_activity_window`, and `graph_labels` on new, migrated, normalized, repaired, imported, and exported cases.

- [ ] **Step 1: Write failing migration, round-trip, and repair tests**

```js
test("graph preferences default and round trip", () => {
  const repo = createLocalCaseRepository(memoryStorage());
  const c = repo.create("Graph");
  assert.deepEqual(pickGraphPreferences(c.ui), {
    graph_layout: "force", graph_hops: "all", graph_activity_window: "all", graph_labels: "auto",
  });
  c.ui.graph_layout = "lanes";
  c.ui.graph_hops = 2;
  const imported = repo.importJson(repo.exportJson(c));
  assert.equal(imported.ui.graph_layout, "lanes");
  assert.equal(imported.ui.graph_hops, 2);
});

test("repair resets only invalid graph preferences", () => {
  const c = migratedPopulatedCase();
  c.ui.graph_layout = "three-dimensional";
  c.ui.graph_hops = 2;
  const loaded = createLocalCaseRepository(memoryStorage([[CASE_KEY_V2, JSON.stringify(c)]])).load();
  assert.equal(loaded.ui.graph_layout, "force");
  assert.equal(loaded.ui.graph_hops, 2);
  assert.equal(loaded.entities.length, c.entities.length);
  assert.deepEqual(loaded.ui.graph_positions, c.ui.graph_positions);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/repository.test.js`

Expected: FAIL because preference defaults are absent.

- [ ] **Step 3: Add one shared normalizer**

```js
function normalizeGraphPreferences(ui = {}) {
  return {
    ...ui,
    graph_layout: ["force", "lanes", "radial"].includes(ui.graph_layout) ? ui.graph_layout : "force",
    graph_hops: ["all", 1, 2].includes(ui.graph_hops) ? ui.graph_hops : "all",
    graph_activity_window: ["all", "24h", "7d", "30d"].includes(ui.graph_activity_window) ? ui.graph_activity_window : "all",
    graph_labels: ["auto", "all", "focus"].includes(ui.graph_labels) ? ui.graph_labels : "auto",
  };
}
```

Call it from new-case creation, v1 migration, v2 normalization, and tolerant repair. Extend strict validation with the exact vocabularies. Do not alter positions or backup records.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test tests/repository.test.js tests/tools.test.js tests/ui-contract.test.js`

Expected: PASS.

```bash
git add public/repository.js tests/repository.test.js
git commit -m "feat: persist graph analysis preferences"
```

---

### Task 3: Investigation controls and path workflow

**Files:**
- Create: `public/ui/graph-controls.js`
- Modify: `public/ui/entities.js`
- Modify: `public/ui/events.js`
- Modify: `public/app.js`
- Modify: `tests/ui-contract.test.js`
- Modify: `tests/graph-model.test.js`

**Interfaces:**
- Consumes: model density, persisted preferences, selected entity, and transient path state.
- Produces: `renderGraphControls(model)`, `renderPathBreadcrumb(caseData, path)`, `graphPreferenceUpdate(caseData, name, value)`, and `nextPathSelection(state, entityId, visibleLinks)`.

- [ ] **Step 1: Write failing control and breadcrumb tests**

```js
test("graph controls expose every analyst mode", () => {
  const html = renderGraphControls({
    preferences: { graph_layout: "force", graph_hops: "all", graph_activity_window: "all", graph_labels: "auto" },
    selectedId: "a", pathMode: false, path: null, density: { message: "" },
  });
  for (const label of ["Relationship map", "Entity lanes", "Radial focus", "All entities", "1 hop", "2 hops", "Case activity", "Trace path", "Fit selection", "Graph legend"]) {
    assert.match(html, new RegExp(label));
  }
});

test("path breadcrumb names entities and relationship types", () => {
  const html = renderPathBreadcrumb(caseData, { nodeIds: ["a", "b"], linkIds: ["ab"] });
  assert.match(html, /example\.com.*resolves to.*192\.0\.2\.1/);
  assert.match(html, /Clear path/);
});
```

- [ ] **Step 2: Run RED, then implement the control renderer**

Run: `node --test tests/ui-contract.test.js`

Expected: FAIL because `ui/graph-controls.js` is missing.

Render one `section.graph-control-deck` containing button groups for layouts and hops, selects for activity and label mode, trace/clear path, fit/fit-selection/reset actions, an expandable `details.graph-legend`, path instructions, breadcrumb, density notice, and an `aria-live="polite"` message. Disable radial and fit selection without a selection. No-path copy is exactly “No path is present in the current graph filters.”

- [ ] **Step 3: Write failing state tests**

```js
test("graph preference updates only one valid field", () => {
  const c = newCase();
  const positions = { ...c.ui.graph_positions };
  graphPreferenceUpdate(c, "graph_layout", "lanes");
  assert.equal(c.ui.graph_layout, "lanes");
  assert.deepEqual(c.ui.graph_positions, positions);
  assert.throws(() => graphPreferenceUpdate(c, "graph_layout", "3d"), /invalid graph preference/);
});

test("path selection chooses start then end without mutating case data", () => {
  const before = JSON.stringify(caseData);
  const first = nextPathSelection({ pathStartId: null, pathEndId: null }, "a", caseData.links);
  const second = nextPathSelection(first, "c", caseData.links);
  assert.equal(first.pathStartId, "a");
  assert.deepEqual(second.path.nodeIds, ["a", "b", "c"]);
  assert.equal(JSON.stringify(caseData), before);
});
```

- [ ] **Step 4: Run RED, then implement state coordination**

Run: `node --test tests/ui-contract.test.js`

Expected: FAIL for missing helper exports.

`graphPreferenceUpdate` validates exact fields and values. `nextPathSelection` returns a new state; a third selection starts a new path. Add transient path state to `ui`, clear it from `resetTransientUi`, and never persist it. Graph node selection chooses endpoints during trace mode and opens the workbench otherwise. Filter changes recompute against visible edges and report no-path only for current filters.

- [ ] **Step 5: Integrate controls and verify GREEN**

Replace duplicated graph controls in `entities.js` with `renderGraphControls`; retain the composer, graph, semantic alternative, entity list, and workbench. Pass a reference timestamp at the app boundary. Restore focus to changed controls after rerender.

Run: `node --test tests/graph-model.test.js tests/ui-contract.test.js tests/repository.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/ui/graph-controls.js public/ui/entities.js public/ui/events.js public/app.js tests/ui-contract.test.js tests/graph-model.test.js
git commit -m "feat: add graph controls and path tracing"
```

---

### Task 4: Semantic SVG renderer and minimap

**Files:**
- Modify: `public/graph.js`
- Modify: `public/graph-model.js`
- Modify: `public/ui/components.js`
- Modify: `public/ui/entities.js`
- Modify: `public/styles.css`
- Modify: `tests/graph-model.test.js`
- Modify: `tests/graph.test.js`
- Modify: `tests/ui-contract.test.js`

**Interfaces:**
- Consumes: filtered nodes/edges with metadata, curve offsets, layout targets, selection, hover, path ids, label mode, and reduced motion.
- Produces: `edgePresentation(link)`, `nodeAccessibleName(node)`, directed curved paths, inline labels/citation counts, typed nodes with analytical rings/badges, hover/focus details, zoom percentage, fit selection, and a desktop minimap.

- [ ] **Step 1: Write failing presentation tests**

```js
test("edge presentation distinguishes directional and symmetric types", () => {
  assert.deepEqual(edgePresentation({
    relationship_type: "resolves_to", status: "proposed", citations: [{ id: "r1" }],
  }), { directional: true, marker: "arrow-proposed", pattern: "6 5", label: "resolves to · 1 source" });
  assert.equal(edgePresentation({ relationship_type: "associated_with", status: "accepted", citations: [] }).directional, false);
});

test("node accessible name includes state without overclaiming", () => {
  const label = nodeAccessibleName({
    type: "domain", value: "example.com", added_by: "agent",
    metadata: { collectionStatus: "indeterminate", evidenceCount: 2, relationshipCount: 3 },
    inPath: true,
  });
  assert.match(label, /Collection inconclusive/);
  assert.match(label, /2 evidence entries/);
  assert.doesNotMatch(label, /verified|confirmed|attributed/i);
});
```

- [ ] **Step 2: Run RED, then implement presentation helpers**

Run: `node --test tests/graph-model.test.js`

Expected: FAIL for missing exports.

Use existing copy label functions. Directional means every type except `observed_with` and `associated_with`. Accepted edges have no dash; proposed use `6 5`; rejected use `2 6`. Singularize source/evidence wording at one.

- [ ] **Step 3: Replace lines with curved labelled paths**

Create SVG markers for accepted, proposed, and rejected. Render one `g.graph-edge[tabindex="0"][role="button"]` with a wide transparent hit path, visible quadratic Bézier path, `textPath` relationship label, citation text, and title. Apply arrows only to directional types. Keep click, Enter, and Space behavior.

- [ ] **Step 4: Render typed nodes and analytical emphasis**

Add inline `ENTITY_GLYPHS` in `components.js`; load no assets. Each node contains collection ring, provenance ring, type disc, glyph, label backing, label, evidence badge, and title. Apply selected, hovered, neighbor, path, and dimmed classes. Accessible names include type, full selector, provenance, collection state, evidence count, relationship count, and path membership.

- [ ] **Step 5: Add layout forces, fit selection, and level of detail**

Relationship map retains saved force positions. Entity lanes uses strong type-based `forceX` targets. Radial focus fixes the selected node centrally and applies hop-ring targets. `fitSelection()` frames selection plus its one-hop neighborhood. Show all labels below 60 nodes, focus/neighbors at 60–150, and focus/path only above 150.

- [ ] **Step 6: Add zoom state and minimap**

Add `<svg class="graph-minimap" aria-hidden="true">` beside the main SVG. Paint simplified nodes/edges and the primary viewport rectangle from the same model and simulation positions; never run a second simulation. Clicking/dragging recenters the primary transform. Emit zoom percentage through `onZoomChange`. Hide minimap below 1000 pixels.

- [ ] **Step 7: Add hover detail, fallback, and reduced-motion behavior**

Emit hover entity/link callbacks and render a noninteractive in-card `role="status"` surface. Escape clears hover emphasis. If D3 is unavailable, keep the complete semantic alternative and entity list and show “Interactive graph unavailable; use the graph text alternative below.” Reduced motion settles synchronously and skips transitions, edge drawing, and animated zoom.

- [ ] **Step 8: Verify GREEN and commit**

Run: `node --test tests/graph-model.test.js tests/graph.test.js tests/ui-contract.test.js`

Expected: PASS.

```bash
git add public/graph.js public/graph-model.js public/ui/components.js public/ui/entities.js public/styles.css tests/graph-model.test.js tests/graph.test.js tests/ui-contract.test.js
git commit -m "feat: render semantic investigation graph"
```

---

### Task 5: Premium site-wide visual system and command access

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/ui/shell.js`
- Modify: `public/ui/overview.js`
- Modify: `public/ui/entities.js`
- Modify: `public/ui/relationships.js`
- Modify: `public/ui/evidence.js`
- Modify: `public/ui/report.js`
- Modify: `public/app.js`
- Modify: `public/ui/events.js`
- Modify: `tests/ui-contract.test.js`

**Interfaces:**
- Consumes: existing renderers and local search.
- Produces: shared premium surfaces, stronger hierarchy, purposeful motion, Command/Ctrl+K search, Escape recovery, and responsive graph/workbench treatment.

- [ ] **Step 1: Write failing command-key and shell tests**

```js
test("command key opens search and Escape closes it", () => {
  assert.equal(commandKeyAction({ key: "k", metaKey: true }, { searchOpen: false }), "open-search");
  assert.equal(commandKeyAction({ key: "k", ctrlKey: true }, { searchOpen: false }), "open-search");
  assert.equal(commandKeyAction({ key: "Escape" }, { searchOpen: true }), "close-search");
});

test("shell exposes local-search shortcut and visual-system hooks", () => {
  const html = renderShell(shellFixture());
  assert.match(html, /Search this case/);
  assert.match(html, /⌘K|Ctrl K/);
  assert.match(html, /app-depth-field/);
  assert.match(html, /workspace-frame/);
});
```

- [ ] **Step 2: Run RED, then implement command access**

Run: `node --test tests/ui-contract.test.js`

Expected: FAIL for missing helper/hook behavior.

`commandKeyAction(event, state)` returns `open-search`, `close-search`, or `null`. Command/Ctrl+K focuses/selects local search. Escape clears results and restores prior focus. Open modal behavior remains authoritative.

- [ ] **Step 3: Establish visual tokens and application depth**

Define four mineral surface levels, azure focus, amber unresolved, violet agent provenance, status red, text, border, glow, and shadow variables. Add one fixed `app-depth-field[aria-hidden="true"]` using radial gradients and a low-contrast 24-pixel grid. Use no external font or image request.

Apply consistent borders, inner highlights, controlled translucency, and elevation to top bar, rail, cards, workbench, bottom navigation, and status bar. Keep selector values monospace and existing readable text sizes.

- [ ] **Step 4: Refine hierarchy, empty states, and motion**

Add `view-enter` to every primary renderer root. Use shared classes for metric, queue, entity, relationship, evidence, Findings, source, and empty-state surfaces. Limit hover movement to 2 pixels/180 ms and entrance to 220 ms. Reduced motion sets effective durations to zero and disables graph draw effects.

- [ ] **Step 5: Complete responsive behavior**

At 1200+ keep full rail and stable workbench. At 760–1199 compact the rail, wrap controls, overlay workbench without graph-control overlap, and hide minimap below 1000. Below 760 retain bottom navigation, 420-pixel graph, scrollable/disclosed controls, full-width workbench sheet, 40-pixel actions, and zero body overflow.

- [ ] **Step 6: Add accessibility and language assertions**

Assert every new control has an accessible name, legend uses `details`, minimap is aria-hidden, path messages are live, and primary roots carry `view-enter`. Extend prohibited static copy to `verified|trusted|proven|confirmed relationship|confidence|attributed`.

- [ ] **Step 7: Verify GREEN and commit**

Run: `node --test tests/ui-contract.test.js tests/graph-model.test.js tests/graph.test.js tests/repository.test.js`

Expected: PASS.

```bash
git add public/index.html public/styles.css public/ui public/app.js tests/ui-contract.test.js
git commit -m "feat: refine cyber investigation visual system"
```

---

### Task 6: Performance, browser QA, screenshots, and release record

**Files:**
- Create: `tests/graph-performance.test.js`
- Modify: `docs/QA-investigation-cockpit.md`
- Modify: `README.md`
- Modify: `docs/SUBMISSION.md`
- Modify: `docs/screenshots/cockpit-1440.png`
- Modify: `docs/screenshots/cockpit-900.png`
- Modify: `docs/screenshots/cockpit-480.png`

**Interfaces:**
- Consumes: completed graph, controls, repository, and visual system.
- Produces: synthetic scale evidence, browser QA, screenshots, release documentation, and a reviewed release candidate.

- [ ] **Step 1: Write the scale test**

```js
test("250 entities and 500 relationships fit the pure-model budget", () => {
  const c = syntheticCase(250, 500);
  const started = performance.now();
  const result = filterGraph(c, { statuses: ["accepted", "proposed"], hops: "all", activityWindow: "all", now: "2026-09-03T12:00:00Z" });
  const elapsed = performance.now() - started;
  assert.equal(result.nodes.length, 250);
  assert.equal(result.links.length, 500);
  assert.ok(elapsed < 100, `pure model took ${elapsed}ms`);
});
```

- [ ] **Step 2: Run automated verification**

Run: `node --test tests/*.test.js`

Expected: every test PASS with zero skipped, cancelled, or todo.

- [ ] **Step 3: Run fresh WebMCP regression**

With one Wrangler server on 8788, verify 10 tools on an empty case; 11 including `pivot_domain` after adding `example.com`; domain collection produces results/leads without accepted relationships; adding IP/URL exposes their pivots; injected demo text stays untrusted and absent from entities, relationships, evidence relevance, and investigator-owned Findings.

- [ ] **Step 4: Run graph browser QA**

Verify all layouts, directional versus symmetric arrows, parallel/reverse edge selection, collection rings, evidence badges, one/two-hop counts, successful/no-path states, accurate Case activity wording, fit/fit-selection/zoom/minimap/reset, preference/position reload, transient path clearing, keyboard traversal, focus restoration, semantic alternative, reduced motion, and a clean console.

- [ ] **Step 5: Capture and inspect responsive screenshots**

Capture populated Case overview and Entities graph at 1440×900, 900×700, and 480×640. Check overflow, controls, workbench, bottom navigation, minimap breakpoint, label density, and graph readability. Convert captures to real PNG where necessary.

- [ ] **Step 6: Update QA and public documentation**

Record final test count, model timing, WebMCP counts, layouts, paths, activity semantics, injection boundary, accessibility, console status, responsive measurements, screenshots, and corrected defects. Describe capabilities without intelligence, verification, confidence, or attribution claims.

- [ ] **Step 7: Run final release verification**

```bash
node --check public/app.js
for file in public/*.js public/ui/*.js; do node --check "$file"; done
node --test tests/*.test.js
git diff --check main...HEAD
git status --short
```

Expected: syntax checks exit 0, every test passes, diff check emits nothing, and only intended QA/documentation files remain before commit.

- [ ] **Step 8: Commit QA evidence**

```bash
git add README.md docs/QA-investigation-cockpit.md docs/SUBMISSION.md docs/screenshots tests/graph-performance.test.js
git commit -m "docs: verify premium investigation graph"
```

- [ ] **Step 9: Request independent whole-branch review**

Review `d253558..HEAD` for graph correctness, technical language, path/filter semantics, state migration, relationship direction, prompt-injection boundaries, accessibility, responsive behavior, performance, and documentation accuracy. Fix every Critical or Important finding test-first and repeat until clean.

- [ ] **Step 10: Present integration options**

After clean review and a fresh full-suite run, present local merge, pull request, or keep-branch choices. Do not merge, push, deploy, or publish without explicit user authorization.
