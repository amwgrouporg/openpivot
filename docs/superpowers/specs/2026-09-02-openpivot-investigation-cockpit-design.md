# OpenPivot Investigation Cockpit — Design Specification

Date: 2026-09-02  
Status: approved design direction; implementation not started

## Summary

OpenPivot will evolve from a compact graph-and-tables demo into a local-first investigation cockpit. The redesign keeps the product's core promise—the agent runs typed, provenanced pivots while the human owns consequential judgments—but makes that promise legible in every screen.

The main product change is organizational rather than decorative. The application will foreground the analyst's next decision: review a proposed relationship, inspect an indeterminate reading, evaluate a candidate, or turn a reading into evidence. The graph remains central, but it becomes one coordinated view of the case rather than the only visual anchor.

The redesign must continue to work reliably in the narrow ChatGPT built-in browser, on conventional laptop widths, and without accounts, backend case storage, a frontend framework, or a build pipeline.

## Goals

1. Make the current state of an investigation understandable within five seconds.
2. Make pending human decisions impossible to miss.
3. Keep every claim, relationship, and evidence item traceable to a reading or source.
4. Make agent activity visible without allowing the agent to impersonate the analyst.
5. Treat untrusted third-party content as a distinct visual and semantic region.
6. Make long-running pivots and partial failures understandable while they happen.
7. Produce a polished three-minute demo because the daily-use workflow is clear, not because the UI is staged for a demo.
8. Preserve the existing WebMCP tool names and the signature ten-to-eleven dynamic registration behavior.
9. Preserve local-first case ownership and the current Worker security boundaries.

## Non-goals

- Accounts, authentication, teams, server-side case storage, or real-time collaboration.
- Natural-person investigation features, breach data, facial recognition, or profile enumeration.
- Automatic acceptance of agent-proposed links or candidates.
- A generic dashboard, project-management system, or chat interface.
- A framework migration, bundler, component library, icon dependency, or design-system package.
- New always-registered WebMCP tools that would change the initial tool count from ten.
- A rewrite of sensor normalization or Worker security behavior except where needed to bound archive latency and expose clearer status.

## Product principles

### Decisions before data density

The interface first shows what requires attention, then supplies the underlying records. Counts are useful only when they lead to an action.

### Provenance is structural

Sources, capture times, actor identity, and review state are not metadata hidden behind disclosure controls. They appear next to the statement or relationship they support.

### Agent proposes; human rules

Agent-added entities remain visually distinct. Agent-created links remain proposed until a person accepts or rejects them. The agent can draft only its memo section. The UI never implies that an unreviewed agent output is a verified finding.

### Untrusted content has a boundary

Extracted or quoted third-party content always appears inside a visually isolated region with an explicit “untrusted source material” label. The surrounding UI explains that the content is evidence to inspect, not instructions to execute.

### Local-first by default

The browser remains the case owner. The storage layer will gain a repository-shaped interface so optional sync could be added later, but this release implements only local storage, import, and export.

## Information architecture

The primary navigation will use five destinations:

1. **Overview** — investigation status and the review queue.
2. **Entities** — graph, entity browser, selected-entity workbench, pivots, and candidates.
3. **Relationships** — proposed, accepted, and rejected links with supporting citations.
4. **Evidence** — captured sources and quotes, plus conversion from readings.
5. **Report** — analyst memo, agent memo, source visibility, and export.

The audit log remains available from a compact activity control rather than occupying an equal primary tab. Raw readings remain accessible through the selected entity and a global readings filter within Overview.

### Overview

Overview answers four questions in order:

- What needs my review?
- What failed or remains indeterminate?
- What did the latest pivot discover?
- What has changed recently?

The page contains a priority queue with sections for proposed relationships, indeterminate readings, unresolved candidates, and recent completed runs. Empty sections collapse. Each row opens the relevant entity, relationship, or reading in context.

### Entities

The graph and entity browser share the main workspace. Selecting a graph node or list row opens the same entity workbench. The workbench contains:

- entity identity, type, notes, actor, and timestamp;
- a single prominent pivot action appropriate to the entity type;
- the current or latest run with per-sensor progress;
- summarized readings with source links and capture times;
- candidates grouped by how they were discovered;
- contextual actions to attach evidence, propose a relationship, edit notes, or remove the entity.

Candidate actions are **Add**, **Add and propose link**, and **Dismiss**. Adding a candidate never creates an accepted relationship. Dismissal is reversible and persists in the case.

### Relationships

Relationships appear as review cards rather than compressed table rows. Each card shows source and target entities, status, proposing actor, rationale, creation time, and direct citation references. Proposed relationships provide Accept and Reject actions. Rejected relationships remain visible under a filter and in the audit log.

### Evidence

Evidence cards show the verbatim quote, source, archive state, associated entities, capture time, and actor. Any reading with a source URL can start an “Attach as evidence” flow with the source and entity prefilled. The analyst must select or enter the exact quote before saving.

### Report

The report workspace presents the editable analyst section first and the agent-authored section second. Agent material retains a visible provenance boundary, but the presentation is optimized for reading rather than resembling a raw warning panel. A source summary lists the evidence and readings cited in the report. Export remains available globally and in the Report view.

## Responsive application shell

### Wide layout: 1180 px and above

- A 216 px navigation and case-summary rail.
- A flexible central investigation surface containing the graph or active collection.
- A 400–460 px contextual workbench on the right.

The workbench may collapse, giving the graph the full remaining width. Navigation labels remain visible.

### Medium layout: 760–1179 px

- A compact 64 px icon-and-count rail.
- One main surface.
- A contextual workbench presented as a right overlay or bottom sheet.

This is the target layout for the ChatGPT built-in browser when enough width is available.

### Narrow layout: below 760 px

- One primary view at a time.
- A five-item bottom navigation bar.
- Entity details and review cards occupy the full content width.
- The graph is a dedicated view with a selected-entity bottom sheet.
- Data tables are replaced by stacked cards; no horizontal scrolling is required for normal use.

The application must remain usable at 480 px wide and 640 px tall. Essential actions must not depend on hover.

## Visual system

The visual character is an investigative workstation: calm, precise, and high-contrast without resembling a terminal.

### Color

- Deep graphite-blue replaces pure black for the application background.
- Elevated surfaces use progressively lighter cool slate values.
- Electric blue is reserved for focus, selection, and primary actions.
- Entity types keep distinct hues, tuned to remain readable on dark surfaces.
- Green, amber, and red communicate accepted/ok, proposed/indeterminate, and rejected/error states, always accompanied by text or an icon.
- Evidence and untrusted content use related warm tones but different treatments: evidence is parchment-like and calm; untrusted source material has an amber boundary and warning stripe.

### Typography

- System sans-serif is used for navigation, actions, and prose.
- Monospace is limited to selectors, identifiers, sensor names, timestamps, and raw content.
- The scale uses 16–18 px page titles, 14 px section titles, 13 px body text, and 11–12 px metadata.
- Long source URLs truncate visually but retain the full URL in accessible text and link targets.

### Shape and motion

- Surfaces use 6–10 px corner radii and subtle borders rather than heavy shadows.
- Buttons have a minimum 32 px target on desktop and 40 px on narrow layouts.
- New readings and graph nodes enter with a short opacity/position transition.
- Motion respects `prefers-reduced-motion` and never blocks interaction.

### Icons

Icons are small inline SVGs stored with the application. They never replace visible labels for consequential actions.

## Graph behavior

The graph will remain D3-based and vendored.

- Node positions are saved per case after a drag settles, producing a stable mental map across renders and reloads.
- Nodes show a compact type glyph, selector label, and actor ring.
- Selection uses a high-contrast halo and synchronizes with the entity browser.
- Proposed edges are dashed amber; accepted edges are solid neutral-blue; rejected edges are hidden by default and available through a filter.
- Edge selection opens its relationship review card.
- Filters support entity type, relationship status, and “connected to selection.”
- Fit, zoom, and reset-layout controls use labeled tooltips and keyboard-accessible buttons.
- The graph exposes a useful list-based alternative for screen readers; no case action requires manipulating the SVG.

## Investigation runs and progress

Pivot execution will be represented as a run with one child status per sensor:

```
run { id, entity_id, requested_by, started_at, completed_at, status, sensors[] }
sensor state { name, status: queued|running|ok|indeterminate, reading_id? }
```

Run state is UI state persisted only when it describes a completed run; transient animation state is not written to the case. The current WebMCP pivot tools keep their names and final return shapes. The UI begins a run immediately, renders all expected sensors, and updates them when the results arrive.

Archive requests are bounded so a WebMCP call completes before the browser's control timeout. The archive sensor must return within an application budget of 20 seconds. If a snapshot is not confirmed, the reading is `indeterminate` with `submitted: true`, a check URL, and a clear “request sent; confirmation pending” summary. The application does not retry an archive submission automatically.

## Data model version 2

The case store will migrate from `openpivot.case.v1` to a versioned repository using `openpivot.case.v2`.

Additions:

```
case.ui          { selected_entity_id?, graph_positions?, dismissed_candidates? }
case.runs        run[]
link.citations   [{ kind: "reading"|"evidence", id }]
evidence.reading_id?  string
run              { id, entity_id, requested_by, started_at, completed_at, status, sensors[] }
```

Only completed runs are appended to `case.runs`; in-progress sensor animation remains ephemeral UI state. Existing entity, reading, evidence, memo, and log fields remain valid. Migration is one-way into a copied v2 record; the v1 value is retained until the migrated v2 case is successfully saved. If migration fails, the app loads the intact v1 case and displays a non-destructive recovery notice.

The storage boundary becomes:

```
CaseRepository.load()
CaseRepository.save(caseData)
CaseRepository.create(title)
CaseRepository.import(markdownOrJson)
CaseRepository.export(caseData)
```

Only `LocalCaseRepository` is implemented now. No networked repository is included.

## WebMCP compatibility

The following behaviors are contractual:

- The ten current static tools keep their names.
- `pivot_domain`, `pivot_ip`, and `pivot_url` remain dynamically registered based on entity types.
- An empty case exposes ten tools; adding the first domain exposes eleven, including `pivot_domain`.
- Tool results retain both text content and `structuredContent`.
- Existing required inputs and accepted inputs remain valid.
- Third-party results keep `untrustedContentHint` and explicit untrusted flags.
- Agent-created links remain proposed.
- The agent cannot edit the analyst memo or accept a relationship.

Enhancements may add optional citation fields to `link_entities` and optional reading references to `attach_evidence`, provided existing calls remain valid. No new static tool is introduced in this release.

## Component and module boundaries

`public/app.js` currently combines tool definitions, orchestration, rendering, and event handling. It will become a thin bootstrap and coordinator.

Proposed modules:

```
public/app.js                    bootstrap and dependency wiring
public/tools.js                  static and dynamic WebMCP descriptors
public/runs.js                   pivot orchestration and run view-models
public/ui/shell.js               responsive shell and navigation
public/ui/overview.js            review queue and activity
public/ui/entities.js            entity browser and workbench
public/ui/relationships.js       relationship review cards
public/ui/evidence.js            evidence cards and attach flow
public/ui/report.js              memo and export workspace
public/ui/components.js          tags, buttons, source links, notices
public/ui/events.js              delegated UI event routing
public/ui/view-models.js         pure case-to-view transformations
public/store.js                  v2 model operations
public/repository.js             local repository and migration
public/graph.js                  D3 rendering and stable positions
```

Modules communicate through case data and explicit callbacks. Views do not call sensors or mutate local storage. Tool descriptors and UI events call the same domain operations, preserving actor attribution.

## Interaction and safety details

- Removing an entity opens an explicit confirmation summarizing linked records that will also be removed. A successful removal provides an undo action until the next persistent mutation.
- Creating a new case keeps the current two-step confirmation but presents the consequence clearly.
- Accept and Reject actions are distinct in color, label, and position and require no hidden menu.
- Keyboard focus returns to the triggering control or the nearest logical destination after a view update.
- Busy state disables only the relevant run controls; the rest of the case remains navigable.
- Errors persist until dismissed or superseded. They are not removed on a five-second timer.
- All external links use HTTP(S), open with `noopener noreferrer`, and show their destination hostname.
- Untrusted text is rendered only as text, never interpreted as HTML or Markdown.

## Empty and first-run experience

An empty case shows a single guided starting point:

1. Choose a selector type.
2. Enter a domain, IP, URL, organization, document, or claim.
3. Add it to the case.
4. If the type has sensors, run the recommended pivot.

The empty state explains in one sentence that the agent can perform the same actions through Site tools. It shows the current tool count and WebMCP availability without requiring the user to read a status-bar string.

## Accessibility

- All controls have visible labels or accessible names.
- Focus indicators meet contrast requirements and are never removed.
- Status is never communicated by color alone.
- Sensor updates use a restrained `aria-live="polite"` region.
- The graph has a synchronized semantic entity/relationship list.
- The application supports keyboard navigation at 200% zoom without losing actions.
- Reduced-motion mode disables graph entry animation and smooth zoom transitions.

## Error handling

Errors fall into three visible categories:

1. **Input error** — invalid selector or missing fields; shown beside the relevant form.
2. **Reading indeterminate** — upstream timeout, malformed response, rate limit, or missing key; shown on the affected sensor card with its source and retry action where safe.
3. **Application recovery** — storage, migration, or WebMCP registration failure; shown as a persistent banner with a non-destructive recovery path.

An indeterminate result never reads as a negative finding. A submitted-but-unconfirmed archive request explicitly distinguishes submission from confirmation.

## Testing strategy

The existing 51 tests remain the baseline and must continue to pass.

Add coverage for:

- v1-to-v2 migration, retention, and recovery behavior;
- pure review-queue and view-model derivation;
- candidate dismissal and reversal;
- link citation validation and export;
- run-state transitions and archive time budgeting;
- WebMCP compatibility, including the ten-to-eleven tool transition;
- UI event routing for review, evidence attachment, removal confirmation, and undo;
- semantic labels, focus behavior, and reduced-motion rules;
- responsive smoke tests at 480 px, 900 px, and 1440 px;
- a browser flow covering add domain, dynamic tool registration, pivot, candidate, link review, injection handling, memo, and export.

Implementation follows test-driven development for new state and behavior. Visual verification uses deterministic fixture cases and screenshots at the three target widths.

## Delivery sequence

1. Extract pure view models and establish the v2 repository/migration boundary.
2. Introduce the new shell, tokens, navigation, and responsive layout.
3. Build Overview and the review queue.
4. Rebuild the entity workbench and candidate workflow.
5. Rebuild relationship review and citation handling.
6. Rebuild evidence and report workflows.
7. Add stable graph positions and graph filters.
8. Add run progress and bounded archive behavior.
9. Complete accessibility, responsive, and end-to-end verification.
10. Re-run the live WebMCP test and update submission screenshots and script only where behavior changed.

## Acceptance criteria

- A first-time user can identify the next human decision from the initial populated screen without opening multiple tabs.
- The complete demo flow works at 480 px width without horizontal scrolling for core actions.
- The initial WebMCP tool count is ten and becomes eleven after adding the first domain.
- Agent-proposed relationships cannot become accepted without a human UI action.
- The injected demo page remains visibly untrusted and cannot create an entity, accept a link, delete data, or alter the analyst memo without explicit user action.
- Every visible relationship can show at least its rationale and any cited reading or evidence references.
- Every reading shows sensor, status, source, time, and requesting actor.
- Archive requests return a confirmed or indeterminate reading before the browser-control timeout.
- Existing v1 cases migrate without data loss and remain recoverable if migration fails.
- All existing and new automated tests pass.
- Screenshots at 480 px, 900 px, and 1440 px show a coherent hierarchy and no clipped primary actions.
