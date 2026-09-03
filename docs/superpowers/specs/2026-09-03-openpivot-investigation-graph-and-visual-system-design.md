# OpenPivot Investigation Graph and Visual System Design

Date: 2026-09-03
Status: Approved direction; implementation specification

## Purpose

OpenPivot will evolve from a polished investigation board into a premium cyber-investigation workspace whose graph is an active reasoning surface. The experience must create immediate visual impact while remaining calm, technically accurate, accessible, and useful during real infrastructure analysis.

The graph is not a decorative network diagram. It must help an investigator understand technical relationships, isolate relevant infrastructure, trace paths, recognize unsupported assertions, and return to source evidence. Site-wide visual refinement must reinforce the same hierarchy: collection, analyst review, evidence, and findings remain distinct.

## Product boundary

OpenPivot supports public-source investigation of domains, IP addresses, URLs, organizations, documents, and claims. It is not an intelligence-agency assessment system, a person-profiling system, or an automated attribution engine.

The enhancement must not introduce:

- confidence scores that are not calculated from a documented method;
- automatic acceptance of agent-proposed relationships;
- wording that treats retrieval, co-occurrence, or analyst acceptance as verification or attribution;
- person-level enrichment, breach data, biometrics, or account discovery;
- 3D presentation, particle effects, fake terminal decoration, or animation without analytical purpose.

## Experience principles

### Analytical meaning before spectacle

Every visual treatment must encode a real property: entity type, relationship direction and type, analyst review state, collection state, evidence count, provenance, selection, path membership, or case-record activity. Effects that encode nothing are excluded.

### Progressive disclosure

The default graph must be readable without configuration. Common actions remain visible; advanced controls reveal detail without overwhelming a new investigator. Labels, badges, rationale previews, and tooltips progressively disclose information as the investigator focuses the graph.

### Investigator authority

Agent-added entities remain visibly distinct. Agent-proposed relationships remain pending analyst review. Evidence and collection signals may increase visibility but never change the relationship verdict. Path tracing and filters reorganize the view only; they do not create case records.

### Local-first and deterministic

All analysis is computed in the browser from the local case. Graph search, filtering, path tracing, layout selection, and activity windows make no network requests. Existing WebMCP tool names, the ten-static-tool contract, and dynamic pivot registration remain unchanged.

## Recommended approach

Retain D3 and SVG, then add investigation-specific graph semantics and a restrained cinematic visual system. The expected case scale is up to 250 visible entities and 500 visible relationships. SVG provides crisp labels, keyboard-addressable records, and direct integration with the existing semantic alternative. A WebGL rewrite would add complexity without improving the target workflow.

At larger visible counts, level-of-detail rules reduce canvas labels and nonessential badges while the semantic alternative remains complete. The interface must show a concise density notice rather than silently removing entities or relationships.

## Information architecture

The five primary destinations remain:

1. Case overview
2. Entities
3. Relationships
4. Evidence
5. Findings

The Entities destination becomes the visual center of the product. The other destinations receive a coordinated visual-system refinement, not a structural rewrite. Existing navigation, entity workbench, relationship review, evidence capture, findings ownership, import/export, and audit trail behavior remain intact.

## Graph visual grammar

### Nodes

Each node contains:

- a type-specific glyph for domain, IP, URL, organization, document, or claim;
- a readable selector label with collision-aware placement;
- a provenance ring: solid for investigator-added, dashed violet for agent-added;
- a collection-state ring: blue when at least one collection result was retrieved, amber when any result is inconclusive, and muted when no collection exists;
- an evidence-count badge when one or more evidence entries reference the entity;
- a high-contrast selection halo;
- a path halo when the node belongs to an active traced path.

Collection-state colors always appear with text in the legend, tooltip, workbench, or semantic alternative. An inconclusive result takes precedence over a retrieved result in the node ring because it represents unresolved collection work, not because it lowers confidence in the entity.

Labels use full values when space permits and an ellipsis only on the canvas. The full selector remains in the SVG title, accessible name, semantic alternative, search result, and workbench.

### Relationships

Relationships render as curved SVG paths rather than undifferentiated lines. Every path includes:

- an arrowhead for directional types;
- no arrowhead for explicitly symmetric `observed_with` and `associated_with` types;
- an inline relationship-type label;
- a citation count when citations exist;
- solid styling for Accepted into case, dashed amber styling for Pending analyst review, and muted dotted styling for Rejected by analyst when rejected records are visible;
- stronger emphasis for selection or active-path membership;
- a hover/focus detail surface containing type, status, rationale, proposing actor, and citation count.

Parallel relationships between the same endpoints use deterministic curve offsets so distinct types and reverse directions remain separately selectable. Edge labels must not state that a relationship is verified, confirmed, or attributed.

### Legend

A compact, expandable legend explains entity colors, provenance rings, collection rings, relationship status patterns, path highlighting, and evidence badges. The legend is visible by default at desktop widths and collapsible on smaller screens.

## Investigation controls

### Layout modes

The graph provides three deterministic modes:

1. **Relationship map** — the existing organic force layout, improved with label collision and parallel-edge spacing.
2. **Entity lanes** — entities align into vertical lanes by type while link, collision, and vertical distribution forces preserve local structure.
3. **Radial focus** — the selected entity occupies the center and connected entities occupy concentric hop rings. When nothing is selected, the control is disabled with an explanatory accessible label.

Changing layout never changes case records. The chosen layout persists in `case.ui.graph_layout`. Investigator-dragged positions remain available to Relationship map and survive filtering.

### Neighborhood isolation

The current Connected to selection control becomes a three-state neighborhood control: All entities, 1 hop, or 2 hops. One and two hops treat visible relationships as traversable in either direction for neighborhood membership while preserving arrows on the canvas. The chosen value persists in `case.ui.graph_hops`.

### Path tracing

The investigator can select **Trace path**, choose a start entity, then choose an end entity. The shortest path is calculated across relationships currently permitted by the relationship-status and entity-type filters. Connectivity traversal is undirected, while edge direction remains visible.

When a path exists:

- path nodes and relationships receive strong emphasis;
- surrounding context dims but remains available;
- a breadcrumb summarizes selectors and relationship types in order;
- each breadcrumb step can open the entity or relationship record;
- Clear path restores the prior graph emphasis.

When no path exists, the interface says no path is present in the current filters and offers no claim about the full case. Path endpoints and the active path are transient UI state and are not persisted or exported.

### Case-activity window

The graph can show All case activity, Last 24 hours, Last 7 days, or Last 30 days. This is explicitly labelled **Case activity**, never “observed,” “first seen,” or “last seen.”

An entity is active in a window when its `added_at`, a related collection result `fetched_at`, or related evidence `captured_at` falls within the window. A relationship is active when its `at` or `reviewed_at` falls within the window. Relationships whose endpoints are both active may remain as context and are marked as contextual rather than in-window activity in the detail surface. The selected activity window persists in `case.ui.graph_activity_window`.

The filter uses an injected/reference timestamp in pure model functions so tests remain deterministic.

### Canvas utilities

The graph toolbar provides:

- Fit graph;
- Fit selection;
- zoom out and zoom in;
- a numeric zoom percentage;
- Reset layout;
- an overview minimap on viewports at least 1000 pixels wide.

The minimap is a simplified, nonsemantic overview of visible nodes, relationships, and the current viewport. It is `aria-hidden`; the primary graph and semantic alternative remain the accessible representations. Clicking or dragging the minimap pans the primary graph.

## Detail and hover behavior

Pointer hover or keyboard focus on a node temporarily emphasizes its immediate neighborhood and shows a compact detail surface with selector, type, provenance, collection summary, evidence count, and relationship count. Focus on a relationship shows its type, review state, rationale, actor, and citations.

Clicking or pressing Enter on a node continues to open the entity workbench. Clicking or pressing Enter on a relationship continues to open the relationship record. Escape clears temporary hover/focus emphasis before it closes any surrounding workbench.

Tooltips remain inside the graph card, avoid covering the focused item when possible, and never contain interactive controls. All actions remain available outside hover-only content.

## Site-wide visual system

### Character

The product should feel like a modern professional analysis instrument: dark mineral surfaces, precise typography, electric azure for active focus, signal amber for unresolved work, and restrained violet for agent provenance. It must avoid neon-green “hacker” styling and intelligence-agency motifs.

### Surfaces and hierarchy

- Add a subtle radial depth field and technical grid to the application background.
- Give the top bar, side rail, cards, workbench, and status bar distinct elevation using borders, inner highlights, shadow, and controlled translucency.
- Increase separation between page purpose, investigator decisions, reference material, and utility controls.
- Use brighter primary text, quieter metadata, and tighter mono typography for selectors and technical values.
- Add purpose-built empty-state compositions that explain the next valid analyst action.
- Keep evidence excerpts visually isolated from investigator commentary and agent-authored content.

### Motion

- Page content may enter with a 160–220 ms opacity/translation transition.
- New graph nodes may scale and fade into place; new relationships may draw once.
- Card hover elevation is limited to 1–2 pixels and 140–180 ms.
- Selection and path emphasis may use a single restrained pulse, never a continuous distracting animation.
- `prefers-reduced-motion: reduce` removes transitions, drawing effects, and animated zoom while preserving every state change.

### Command access

The existing local case search gains a visible keyboard hint and opens with Command/Ctrl+K. Escape clears or closes search results and restores focus. Search remains entirely local and continues to route to the exact case record.

## Responsive behavior

### Wide desktop: 1200 pixels and above

- Full side rail and top bar remain visible.
- The graph, expanded legend, and minimap render together.
- The selected entity workbench occupies a stable right-side panel without obscuring graph controls.

### Compact desktop/tablet: 760–1199 pixels

- The side rail compacts to icons.
- Graph controls wrap into two concise rows.
- The workbench overlays the right side with a clear close action.
- The minimap is hidden below 1000 pixels.

### Mobile: below 760 pixels

- Bottom navigation remains visible.
- The graph uses a minimum 420-pixel canvas and simplified auto labels.
- Analysis controls become horizontally scrollable or open from one labelled Graph controls button.
- The entity workbench becomes a full-width sheet.
- Hover-only behavior is replaced by tap/focus behavior.
- No horizontal body overflow is permitted at 480 pixels.

## Accessibility

- All graph controls have visible labels or explicit accessible names.
- Nodes and relationships remain keyboard focusable in a logical DOM order.
- Arrow direction, relationship type, analyst review state, collection state, evidence count, and path membership are included in accessible names where applicable.
- The complete semantic graph alternative remains available and reflects active filters and traced paths.
- Focus is never left on a removed control after filtering, changing layout, clearing a path, or processing a lead.
- Text and meaningful UI boundaries meet WCAG AA contrast.
- Color is always supplementary to text, shape, line pattern, or iconography.
- Tooltips use `role="status"` or descriptive association without trapping focus.

## State model and compatibility

The existing v2 case schema gains optional UI preferences:

```text
ui.graph_layout          "force" | "lanes" | "radial"
ui.graph_hops            "all" | 1 | 2
ui.graph_activity_window "all" | "24h" | "7d" | "30d"
ui.graph_labels          "auto" | "all" | "focus"
```

Defaults are `force`, `all`, `all`, and `auto`. Normalization and tolerant repair add missing defaults without overwriting the original stored recovery record. v1 migration, older v2 cases, JSON import/export, entity removal/undo, hidden graph positions, and filtered-position persistence remain valid.

Path endpoints, active traced paths, hover state, zoom transform, and tooltip state are transient and do not enter the case schema.

## Component boundaries

### `public/graph-model.js`

Pure graph analysis functions:

- derive node collection/evidence/degree metadata;
- apply type, relationship status, neighborhood, and case-activity filters;
- calculate shortest paths;
- calculate connected components and density notices;
- derive deterministic parallel-edge offsets;
- derive lane and radial layout targets.

All functions accept complete inputs and return plain data without accessing the DOM, storage, time, D3, or network.

### `public/graph.js`

D3/SVG rendering only:

- markers, curves, labels, node glyphs, badges, minimap, zoom, drag, and transitions;
- applies model output and emits select, hover, zoom, path-endpoint, and saved-position callbacks;
- contains no case mutation or filtering policy.

### `public/ui/graph-controls.js`

Renders the graph analysis controls, legend, path breadcrumb, density notice, and empty/filter states. It maps UI events to explicit state changes but does not render D3 or mutate case data.

### Existing modules

- `public/ui/entities.js` composes the graph workspace and workbench.
- `public/app.js` owns transient graph interaction state and coordinates rendering.
- `public/repository.js` normalizes and repairs persisted graph preferences.
- `public/styles.css` defines the shared visual system and responsive behavior.
- `public/ui/shell.js` adds the search shortcut hint and refined chrome.

## Error and empty states

- No matching filters: explain which filters are active and provide Clear graph filters.
- No path in current filters: state that limitation exactly and retain the chosen endpoints for adjustment.
- Missing/stale relationship endpoint: exclude the invalid edge from the canvas while the repository recovery path preserves a review notice.
- D3 unavailable: retain the semantic alternative and entity list; show a restrained graph-unavailable notice.
- Dense graph: keep all records accessible, reduce canvas labels in auto mode, and show the visible entity/relationship counts.
- Invalid persisted graph preference: restore only that preference to its documented default.

## Performance requirements

- Initial graph interaction becomes available within 500 ms after the Entities view renders for 250 nodes and 500 relationships on a current desktop browser, excluding application startup.
- Pointer and keyboard selection updates visual emphasis without rebuilding unrelated page sections.
- Layout changes reuse node objects and avoid discarding saved positions.
- Position persistence remains debounced.
- The minimap reuses graph model output and does not run a second force simulation.
- Auto labels show all labels below 60 nodes, focus/neighbor labels from 60–150 nodes, and focus-only labels above 150 nodes.

## Testing strategy

### Pure model tests

- collection-state precedence and evidence counts;
- one-hop and two-hop neighborhood membership;
- shortest path under active status/type filters and no-path behavior;
- deterministic case-activity filtering at each window;
- contextual relationship marking;
- directional versus symmetric edge metadata;
- stable parallel-edge offsets;
- lane and radial target derivation;
- level-of-detail thresholds and density notices.

### Repository tests

- new defaults;
- normalization of older v2 cases;
- populated v1 migration;
- repair of invalid preference values without loss of entities, relationships, evidence, or positions;
- JSON round trip of graph preferences.

### UI contract tests

- labelled layout, neighborhood, activity, label-density, path, fit-selection, zoom, legend, and clear-filter controls;
- accurate accessible names for nodes and relationships;
- actual collection and review status language;
- path breadcrumb and no-path wording;
- Command/Ctrl+K and Escape search behavior;
- reduced-motion classes and no unsupported verification language.

### Browser QA

- populated technical case at 1440×900, 900×700, and 480×640;
- all three layout modes;
- one-hop and two-hop isolation;
- successful and unsuccessful path tracing;
- parallel typed relationships and reverse-direction selection;
- minimap pan at wide desktop;
- keyboard traversal and focus restoration;
- saved preferences and dragged positions after reload;
- no horizontal body overflow;
- no console warnings or errors;
- unchanged 10→11 WebMCP registration behavior;
- injected external text remains untrusted and cannot mutate investigator-owned fields.

## Acceptance criteria

- An investigator can identify entity type, relationship type and direction, analyst review state, unresolved collection, and evidence presence without opening a second view.
- The investigator can isolate one or two hops and trace a shortest path without altering the case.
- Every graph filter and layout accurately describes its analytical effect and restores focus safely.
- Case-activity filtering never implies external observation time.
- The graph remains readable and responsive at the documented target scale.
- The graph and the rest of the site share one premium, restrained visual language.
- Mobile, keyboard, screen-reader, and reduced-motion experiences retain functional parity.
- Existing case data, import/export, relationship review, evidence capture, Findings ownership, and WebMCP registration contracts remain backward compatible.
- The complete automated suite, browser workflow, responsive screenshots, and independent review are clean before integration.
