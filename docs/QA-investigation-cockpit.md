# Investigation Cockpit QA

Date: 2026-09-03
Branch: `feat/investigation-cockpit`

## Automated verification

Command:

```bash
node --test tests/*.test.js
```

Final result: 169 tests passed, 0 failed, 0 skipped, 0 cancelled, 0 todo.

The 250-entity / 500-relationship pure graph model completed in **21.768621 ms** against a
100 ms budget. The measurement uses the same synthetic case and filter options as
`tests/graph-performance.test.js`; the enclosing test took 23.380281 ms in the final full-suite run.

### Complete browser graph performance

Environment: Codex in-app browser, Chromium-based engine, 1280 × 720 viewport. The supported Browser
API does not expose the exact Chromium user-agent/version. A generated, repository-valid 149 KB case
with 250 entities and 500 accepted/proposed relationships was imported through the visible
**Findings → Import case JSON** file chooser, exercising the application's normal repository validation,
persistence, transient-state reset, and render path.

After reloading the imported case, QA activated Case overview and then Entities. Temporary in-page
instrumentation measured from the start of the Entities navigation handler through synchronous
`render()`, `createGraph()`, `graph.update()`, SVG record creation, and pointer/keyboard handler binding.
The serialized result was:

```text
openpivot: entities interaction ready {"elapsed_ms":184.60000002384186,"nodes":250,"edges":500}
```

The complete graph therefore became interactive in **184.60000002384186 ms**, below the 500 ms browser
budget, with exactly 250 `g.graph-node` and 500 `g.graph-edge` records already bound. Pressing Enter on
the first graph node opened its visible entity workbench. An external Browser-client activation/poll
clock measured 704 ms because it also includes automation RPC and polling latency; it is recorded as a
conservative end-to-end harness observation, not the application render budget. The temporary
instrumentation was removed after capture; no performance-only code remains.

Coverage added for:

- v1-to-v2 migration and retained v1 backup;
- malformed import recovery;
- candidate dismissal and restoration;
- undoable entity removal;
- completed pivot runs and sensor state transitions;
- citation-aware relationships and export;
- the ten-static-tool and dynamic-eleventh-tool WebMCP contract;
- safe source links and readable badges;
- Overview, entity, relationship, evidence, and report view behavior;
- graph filtering, saved positions, and connected-node filtering;
- the 18-second archive submission budget;
- rejection of invalid candidate selectors surfaced by certificate data;
- recovery of a valid migrated case when v2 persistence fails;
- nested import validation and stale-reference rejection;
- delayed real-registry WebMCP registration;
- nonblank evidence quotes and persisted archive submission state;
- literal Markdown export of untrusted fields;
- dependent-run and reference cleanup during undoable removal;
- form-state capture and focus restoration during rerenders;
- tolerant, non-overwriting repair of inconsistent stored v2 references;
- citation cleanup/restoration during entity removal;
- hidden graph-position preservation while filters are active;
- persistent restoration of dismissed candidates;
- cross-case undo invalidation and transient-state reset;
- fenced literal export of untrusted evidence blocks;
- migration, validation, and recovery of the case objective, scope, and status;
- typed technical relationships and evidence relevance notes without breaking older cases;
- analyst-level status labels that do not present collection as verification;
- grouped investigative leads, persistent selection, batch add, and batch dismissal;
- local case search across entities, collection results, evidence, relationships, and findings;
- independent investigator notes, collection gaps, methodology, and agent-draft authority boundaries;
- populated v1 relationship/evidence migration through the repository load path;
- directional and type-aware relationship deduplication, including explicit symmetric types;
- truthful source-status rendering in Findings and search coverage for every visible relationship type;
- neutral network-organization lead semantics and focus recovery after processing the final lead;
- rejection of prompt-injection text as a lead or mutation of investigator-owned fields;
- the 250-entity / 500-relationship pure graph budget;
- finite, distinct force-layout positions after Reset layout; and
- pointer separation for parallel and reverse-direction relationship paths.

## Local WebMCP flow

One local Wrangler 4.128.0 Worker was used for the entire run on port 8788. Browser surface:
**Codex in-app browser**. An unused `http://localhost.:8788/` origin provided a genuinely empty
local case without deleting earlier browser data.

| Check | Result |
|---|---|
| Empty-case tools | Exactly 10: `read_case`, `add_entity`, `link_entities`, `attach_evidence`, `search_web`, `lookup_wikidata`, `extract_page`, `build_queries`, `write_memo`, `export_case` |
| Add `example.com` | `pivot_domain` appeared; count 10 → 11 |
| Domain pivot | DNS, RDAP, certificates, Wayback, and urlscan returned 5 `ok` readings and 14 leads |
| Relationship boundary | Domain collection created 0 relationships; all leads remained untriaged selectors |
| Add IP and URL | `pivot_ip` and `pivot_url` appeared; count reached 13 |
| Injection URL | `pivot_url` ran with `archive: false`; Wayback and extract returned 2 `ok`, `untrusted` readings and 2 outbound-link leads |
| Injection boundary | `verified-partner.example` appears in the raw untrusted extract only; it is absent from entities, relationships, evidence relevance, Investigator notes, collection gaps, and methodology |
| Boundary snapshot | 3 entities, 0 relationships, 7 readings, 0 evidence entries, 13 available tools |
| Populated browser-QA case | 6 entities, 5 accepted relationships, 1 pending relationship, 1 rejected relationship, 1 source-linked evidence entry |

## Cyber-investigation workflow verification

| Check | Result |
|---|---|
| Investigation definition | Objective, scope, and case status saved and survived reload |
| Scope boundary | Public DNS, registration, certificate, URL-scan, and archive sources; no person-level enrichment |
| Lead triage | Leads grouped by source entity and collection method |
| Batch add | Two selected leads became entities without creating relationships |
| Relationship semantics | Explicit technical relationship types are shown separately from the analyst verdict |
| Evidence semantics | Verbatim source excerpt and analyst relevance note remain separate fields |
| Case search | `registration` returned matching entity, collection result, evidence, and agent-draft records |
| Search routing | Selecting an evidence result opened Source excerpts and focused the matching record |
| Relationship search | Searching the visible phrase `associated with` returned the matching typed relationship records |
| Findings | Investigator notes, outstanding questions, methodology, and agent draft persisted independently |
| Authority boundary | Agent draft remains visibly marked as requiring validation; collection is never labelled verified |
| Prompt injection | No `verified-partner.example` entity or relationship; evidence relevance, Investigator notes, collection gaps, and methodology contain none of the injected wording |
| Fresh dynamic registration | Empty case exposed 10 tools; adding `example.com` exposed 11 including `pivot_domain` |

Archive submission was not repeated because it creates a public third-party side effect. The existing
archive sensor regression verifies the 18-second application budget and submitted-but-unconfirmed
`indeterminate` shape; this browser run passed `archive: false` explicitly.

## Investigation graph browser matrix

| Check | Browser result |
|---|---|
| Layouts | Relationship map rendered freely; Entity lanes separated all six entity types; Radial focus placed the selected domain exactly at the 309 × 520 canvas center `(154.5, 260)` |
| Relationship direction | The seven-edge All view showed 4 directional arrow markers and 3 symmetric paths without arrows; status remains separately encoded by text, color, and line pattern |
| Parallel / reverse edges | Three domain–IP paths used distinct curves. After QA increased adjacent curve offsets from 18 to 40, direct pointer targeting and Enter activation each opened the intended reverse `custom` relationship card rather than the symmetric path |
| Collection / evidence state | Domain and URL nodes used the retrieved-collection ring; the domain node announced and rendered 1 evidence entry; nodes without results retained the neutral ring |
| Neighborhoods | Selected-domain counts were 4 nodes / 5 links at 1 hop, 6 / 7 at 2 hops, and 6 / 7 for All entities |
| Successful path | `example.com → redirects to → injected URL → references → RDAP registration record`; 3 nodes and 2 paths were emphasized |
| No-path state | Filtering to claim + document produced 2 nodes / 0 links and the explicit “No path is present in the current graph filters” state |
| Transient path | Clear path restored 0 emphasized nodes / paths, disabled itself, returned the instructions, and restored focus to Trace path |
| Case activity | All activity, Last 24 hours, Last 7 days, and Last 30 days retained the explicit **Case activity** label; each current QA record remained visible as 6 nodes / 7 links |
| Fit and zoom | Zoom moved 100% → 125% → 100%; Fit selection reached 141%; Fit graph reached 115% |
| Minimap | Present at 1440; clicking it changed the graph translation while retaining scale; hidden at 900 and 480 by the responsive breakpoint |
| Reset layout | Browser QA first reproduced all six force nodes collapsing to `(0,0)`; after the correction Reset produced six distinct finite positions |
| Reload | Entity lanes and the selected domain survived reload. A dragged domain moved from `(233.022, 267.485)` to `(329.972, 223.854)` and reloaded at `(295.696, 240.871)` before force settling |
| Keyboard and focus | Six graph nodes and six in-case edges exposed `role=button` / `tabindex=0`; Enter selected the exact reverse edge. Workbench close returned focus to its entity row, entity selection focused the workbench heading, filters restored their controls, and relationship verdicts focused the reviewed card |
| Semantic alternative | The active graph exposed 12 alternative buttons (6 nodes + 6 in-case edges); a traced path added “included in traced path” to its 3 node and 2 relationship alternatives |
| Reduced motion | Live emulation remains platform-blocked. The Codex in-app browser exposes no media emulation; connected Google Chrome 152.0.7977.65 exposes viewport only through the supported Browser API, and browser security policy blocked Chrome-internal emulation with an explicit no-workaround directive. No alternate CDP or settings mutation was attempted. Existing evidence remains one `prefers-reduced-motion: reduce` CSS branch plus three passing integration-helper tests for synchronous settle, drag repaint/publish, and radial fixed-center behavior |
| Console | Final browser log query returned 0 warnings and 0 errors |

Accessibility inspection found no duplicate ids. The browser accessibility tree named navigation,
graph controls, graph nodes, relationship paths, source links, forms, workbench actions, and the
complete text alternative. The populated graph presented 68 visible interactive controls; the optional
entity-notes input derives its browser-accessible name from the visible placeholder.

## Responsive verification

Both the populated Case overview and Entities graph were captured at all three target sizes. All six
states rendered without horizontal body overflow. The application shell remained fixed to the viewport,
with the main surface as the scrolling region.

| Viewport | Result | Screenshot |
|---|---|---|
| 480 × 640 | 480 px body/main widths; overview heading 439.1 px; objective field 422 px; bottom navigation y=558–615; status bar y=615–640. Graph canvas 452 px, compact controls use an internal horizontal scroller, and minimap is hidden | `docs/screenshots/cockpit-480.png` |
| 900 × 700 | 64 px compact rail; 475.7 px heading; 320 px overlaid workbench; graph controls 471/471 px with no overflow; minimap hidden | `docs/screenshots/cockpit-900.png` |
| 1440 × 900 | 216 px full rail; 475.7 px heading; 558 px objective field; 430 px workbench; graph canvas remains visible beside it and the minimap is present | `docs/screenshots/cockpit-1440.png` |

The in-app browser returned JPEG-encoded screenshot bytes despite `.png` filenames. Every release and
temporary alternate capture was converted and rechecked as 8-bit RGB, non-interlaced PNG with the exact requested
dimensions. Visual inspection covered all six captures: the overview hierarchy remains calm and readable;
the 900 px workbench overlays without compressing controls; 480 px retains bottom navigation and hides the
minimap; type glyphs, collection rings, evidence counts, relationship patterns, and directional markers
remain distinguishable. At 480 px, long technical labels are compact or truncated on-canvas while their
exact values remain in the entity list and semantic alternative.

## Accessibility and interaction checks

- Compact navigation buttons retain explicit accessible names when visual labels are hidden.
- Primary navigation, graph nodes, semantic graph alternatives, review actions, source links, forms, and close controls are keyboard addressable.
- All statuses include text; color is supplementary.
- Focus styles are visible.
- The connection and toast regions use polite live announcements.
- Reduced-motion styles remove nonessential transition duration.
- Untrusted source material is escaped text inside a labeled, visually isolated panel.
- Unsafe URL schemes render as inert text rather than anchors.
- Unsaved Evidence form values and active text focus survive a concurrent agent mutation.
- Dialogs move focus inside, make the background inert, close on Escape, and restore focus to their trigger.
- Candidate dismissal exposes Restore; Add consumes the candidate from the originating queue.
- Entity notes are editable and recorded as an analyst action.
- Navigation moves focus to the destination heading; entity selection moves it to the workbench title.
- Graph filters restore focus to the activated filter, and closing the workbench returns focus to the entity row.
- Relationship verdicts keep focus on the reviewed relationship card.
- Verdicts made from a Proposed-only filter switch to a containing filter before restoring card focus.
- Processing every visible lead returns focus to the review-priorities heading when the triage toolbar disappears.
- Reduced-motion graph resets settle and repaint synchronously.

## Defects found and corrected during QA

1. Medium-width workbench originally compressed the page heading to 68 px. It now overlays the main surface at 760–1000 px; the measured heading width is 476 px at 900 px.
2. Narrow content initially expanded the root grid and pushed bottom navigation below the viewport. The root shell is now fixed to the viewport; at 480 × 640 the bottom navigation occupies y=558–615 and the status bar y=615–640.
3. Compact-rail labels were visually hidden without independent accessible names. Every navigation control now has an explicit `aria-label`.
4. Email-shaped certificate names were shown as unusable domain candidates. Candidate generation now applies the same validation used when adding an entity.
5. Running two local Worker instances against one Durable Object SQLite state produced `SQLITE_BUSY_RECOVERY`. QA was repeated with a single local instance; this was a test-environment contention issue, not an application defect.
6. A strict validator initially checked populated v1 relationships and evidence before applying v2 defaults. Migration now upgrades a cloned legacy case first and validates the complete v2 record; populated repository-load coverage prevents silent replacement.
7. Relationship deduplication originally collapsed reverse-direction and different-type assertions. It now keys on type and direction, reversing endpoints only for explicitly symmetric `observed_with` and `associated_with` relationships.
8. Findings initially displayed every collection source as Retrieved. Source models now retain and render the actual collection status.
9. Network-provider data initially used ownership/hosting language. It is now labelled as a network-organization lead and defaults to the non-attributive `associated_with` relationship pending analyst review.
10. Batch triage initially targeted a toolbar that disappears when the final lead is processed. Browser QA confirmed focus now lands on the resulting review heading.
11. Relationship-map Reset layout deleted D3 coordinates after simulation initialization and collapsed every node to `(0,0)`. Force reset now seeds a deterministic ring before restarting; browser QA measured six distinct finite positions.
12. Adjacent parallel paths were separated by only 9 px at their midpoint while each pointer hit target was 18 px wide. Deterministic curve offsets now provide 20 px midpoint separation, and direct pointer plus keyboard selection each opened the intended reverse edge.

Final browser console: no warnings or errors.
