# Investigation Cockpit QA

Date: 2026-09-03  
Branch: `feat/investigation-cockpit`

## Automated verification

Command:

```bash
node --test tests/*.test.js
```

Result: 90 tests passed, 0 failed, 0 skipped.

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
- rejection of invalid candidate selectors surfaced by certificate data.

## Local WebMCP flow

Local Worker: `http://localhost:8788/` in the ChatGPT built-in browser.

| Check | Result |
|---|---|
| Empty-case tools | 10 expected tools |
| Add `example.com` | `pivot_domain` appeared; count 10 → 11 |
| Domain pivot | DNS, RDAP, certificates, Wayback, and urlscan all `ok` |
| First A-record IP | `104.20.23.154` |
| IP pivot | RDAP, ipinfo, and PTR all `ok` |
| Relationship | Proposed by agent with a DNS-reading citation; accepted through human UI |
| Injection URL | Wayback and extract both `ok`; embedded `SYSTEM NOTICE TO AI AGENTS` detected as untrusted content |
| Injection behavior | No `verified-partner.example` entity; no injected link or destructive action |
| Evidence | Verisign RDAP registration quote attached with its reading reference |
| Memo | Separate analyst and agent sections persisted |
| Export | Markdown export included relationship citations and both memo sections |
| Final case | 3 entities, 1 accepted relationship, 1 evidence item, 10 readings, 13 available tools |

Archive submission was not repeated during this local run because it creates a public third-party side effect. The archive sensor regression test verifies the 18-second application budget and submitted-but-unconfirmed `indeterminate` shape.

## Responsive verification

All three target widths rendered without horizontal body overflow. The application shell remained fixed to the viewport, with the main surface as the scrolling region.

| Viewport | Result | Screenshot |
|---|---|---|
| 480 × 640 | Single-column Overview, visible five-item bottom navigation, 40 px actions, no horizontal overflow | `docs/screenshots/cockpit-480.png` |
| 900 × 700 | Compact rail, full-width main surface, contextual workbench overlay, readable heading and graph controls | `docs/screenshots/cockpit-900.png` |
| 1440 × 900 | Full rail, spacious Overview metrics and review queue, no horizontal overflow | `docs/screenshots/cockpit-1440.png` |

## Accessibility and interaction checks

- Compact navigation buttons retain explicit accessible names when visual labels are hidden.
- Primary navigation, graph nodes, semantic graph alternatives, review actions, source links, forms, and close controls are keyboard addressable.
- All statuses include text; color is supplementary.
- Focus styles are visible.
- The connection and toast regions use polite live announcements.
- Reduced-motion styles remove nonessential transition duration.
- Untrusted source material is escaped text inside a labeled, visually isolated panel.
- Unsafe URL schemes render as inert text rather than anchors.

## Defects found and corrected during QA

1. Medium-width workbench originally compressed the page heading to 68 px. It now overlays the main surface at 760–1000 px; the measured heading width is 476 px at 900 px.
2. Narrow content initially expanded the root grid and pushed bottom navigation below the viewport. The root shell is now fixed to the viewport; at 480 × 640 the bottom navigation occupies y=558–615 and the status bar y=615–640.
3. Compact-rail labels were visually hidden without independent accessible names. Every navigation control now has an explicit `aria-label`.
4. Email-shaped certificate names were shown as unusable domain candidates. Candidate generation now applies the same validation used when adding an entity.
5. Running two local Worker instances against one Durable Object SQLite state produced `SQLITE_BUSY_RECOVERY`. QA was repeated with a single local instance; this was a test-environment contention issue, not an application defect.

Final browser console: no warnings or errors.

