# OpenPivot Cyber Investigation Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine OpenPivot into an analyst-grade cyber investigation workspace with technically accurate language, investigation framing, grouped lead triage, typed relationships, evidence relevance, local search, and structured findings.

**Architecture:** Extend the validated v2 local case model without changing its storage key or WebMCP tool count. Keep domain behavior in `store.js`, pure derivation in view models, reusable language in a copy module, and UI events in the existing delegated controller. All new capabilities remain browser-local and backwards compatible.

**Tech Stack:** Browser-native ES modules, semantic HTML, CSS, vendored D3 7.9, Cloudflare Workers, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-openpivot-cyber-investigation-refinement-design.md`

## Global Constraints

- Target cyber investigation workflows: SOC/DFIR, threat research, trust-and-safety, infrastructure attribution, technical fact-checking, and source-based OSINT.
- Do not introduce intelligence-agency terminology, unsupported confidence scoring, or claims that retrieved material is verified.
- Preserve all ten static WebMCP tool names and the empty-case 10→11 domain-pivot transition.
- Keep existing tool inputs valid; all schema additions are optional.
- Keep cases local to the browser and do not add runtime dependencies or a build pipeline.
- Continue treating all external content as untrusted text.
- Preserve 480 × 640, 900 × 700, and 1440 × 900 usability.

---

### Task 1: Cyber investigation model and language contract

**Files:**
- Create: `public/ui/copy.js`
- Modify: `public/repository.js`
- Modify: `public/store.js`
- Modify: `public/tools.js`
- Modify: `tests/repository.test.js`
- Modify: `tests/tools.test.js`
- Create: `tests/copy.test.js`

**Interfaces:**
- `COPY`, `collectionStatusLabel(status)`, `relationshipStatusLabel(status)`, `relationshipTypeLabel(type)`.
- `updateCaseBrief(caseData, input, actor)`.
- `updateInvestigatorNotes(caseData, {human,gaps,methodology}, actor)`.
- `RELATIONSHIP_TYPES` and optional `relationship_type` in `addLink`.
- Optional `relevance` in `addEvidence`.

- [ ] Write failing tests proving v2 normalization adds blank `brief`, `memo.gaps`, and `memo.methodology`; relation types default compatibly; evidence relevance defaults blank; and status copy maps `ok` to `Retrieved` and `indeterminate` to `Collection inconclusive`.
- [ ] Run `node --test tests/repository.test.js tests/tools.test.js tests/copy.test.js` and verify failure for missing fields/module.
- [ ] Implement the model additions, strict validation, tolerant repair, domain mutations, and optional WebMCP schema fields.
- [ ] Run the targeted tests and the full suite.
- [ ] Commit with `feat: add cyber investigation case semantics`.

### Task 2: Analyst-grade language and case overview

**Files:**
- Modify: `public/ui/shell.js`
- Modify: `public/ui/overview.js`
- Modify: `public/ui/entities.js`
- Modify: `public/ui/relationships.js`
- Modify: `public/ui/evidence.js`
- Modify: `public/ui/report.js`
- Modify: `public/ui/components.js`
- Modify: `public/ui/events.js`
- Modify: `public/app.js`
- Modify: `tests/ui-contract.test.js`

**Interfaces:**
- `renderCaseBrief(brief)` within Overview.
- Case action `saveCaseBrief(input)`.
- Shared visible status labels from `copy.js`; backend values remain unchanged.

- [ ] Write failing renderer/action tests for required page headings, separate review-priority groups, case brief editing, and absence of overclaiming phrases in primary rendered views.
- [ ] Run `node --test tests/ui-contract.test.js tests/copy.test.js` and verify the expected language failures.
- [ ] Replace developer-centric copy with the approved cyber-investigation wording and add the editable investigation objective/scope/status card.
- [ ] Wire case brief persistence, focus behavior, and audit entries.
- [ ] Run targeted and full tests, then commit with `feat: add cyber investigation overview and terminology`.

### Task 3: Grouped lead triage and batch actions

**Files:**
- Modify: `public/ui/view-models.js`
- Modify: `public/ui/overview.js`
- Modify: `public/ui/entities.js`
- Modify: `public/ui/events.js`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `tests/view-models.test.js`
- Modify: `tests/ui-contract.test.js`

**Interfaces:**
- `groupInvestigativeLeads(caseData, candidateMap)` grouped by parent and source method.
- Ephemeral `ui.selectedLeadKeys`.
- Actions `addSelectedLeads(items)` and `dismissSelectedLeads(items)`; neither creates relationships.

- [ ] Write failing tests that group leads by parent/method, retain source result IDs, select multiple leads, add/dismiss batches, and never create implicit relationships.
- [ ] Run targeted tests and verify missing behavior.
- [ ] Implement grouped lead cards, source-method labels, selection controls, batch toolbar, and persistent dismissed-lead restoration.
- [ ] Verify keyboard focus after batch actions and rerenders.
- [ ] Run targeted/full tests and commit with `feat: add cyber lead triage workflow`.

### Task 4: Typed relationships and evidence relevance

**Files:**
- Modify: `public/store.js`
- Modify: `public/tools.js`
- Modify: `public/ui/relationships.js`
- Modify: `public/ui/evidence.js`
- Modify: `public/ui/events.js`
- Modify: `public/app.js`
- Modify: `tests/tools.test.js`
- Modify: `tests/ui-contract.test.js`
- Modify: `tests/view-models.test.js`

**Interfaces:**
- Optional `relationship_type` in the existing `link_entities` tool and relationship composer.
- Optional `relevance` in the existing `attach_evidence` tool and evidence composer.
- Exports include visible relationship labels and evidence relevance separately from literal source excerpts.

- [ ] Write failing compatibility and rendering tests for default and explicit relationship types, optional relevance, safe export, and exact source-excerpt separation.
- [ ] Run targeted tests and verify failures.
- [ ] Implement schemas, domain validation, relationship/evidence cards, composers, and export changes.
- [ ] Run targeted/full tests and commit with `feat: type relationships and annotate evidence relevance`.

### Task 5: Local case search and structured Findings

**Files:**
- Modify: `public/ui/view-models.js`
- Create: `public/ui/search.js`
- Modify: `public/ui/shell.js`
- Modify: `public/ui/report.js`
- Modify: `public/ui/events.js`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `tests/view-models.test.js`
- Modify: `tests/ui-contract.test.js`

**Interfaces:**
- `searchCase(caseData, query) -> [{kind,id,title,context,view,entity_id?}]`.
- Ephemeral `ui.searchQuery` and search-result routing.
- Case actions save `memo.human`, `memo.gaps`, and `memo.methodology` independently while preserving agent authority boundaries.

- [ ] Write failing tests for case-insensitive search across every specified case field, empty-query behavior, typed result routing, and separate Findings fields.
- [ ] Run targeted tests and verify missing behavior.
- [ ] Add the top-bar local search control, keyboard-friendly results panel, result routing, and empty states.
- [ ] Rebuild Report as Findings with Investigator notes, Outstanding questions and collection gaps, Methodology and handling notes, Agent draft — requires validation, and source ledger.
- [ ] Run targeted/full tests and commit with `feat: add local case search and structured findings`.

### Task 6: Cyber investigation QA and release review

**Files:**
- Modify: `README.md`
- Modify: `docs/SUBMISSION.md`
- Modify: `docs/QA-investigation-cockpit.md`
- Replace: `docs/screenshots/cockpit-480.png`
- Replace: `docs/screenshots/cockpit-900.png`
- Replace: `docs/screenshots/cockpit-1440.png`

- [ ] Run syntax checks for every browser module and the complete automated suite.
- [ ] Run a clean local WebMCP case: exact 10→11 transition, domain pivot, IP pivot, typed cited relationship, evidence relevance, injected-page safety, Findings fields, search, and export.
- [ ] Exercise batch lead triage, dismissed-lead restoration, focus preservation, dialogs, search routing, and concurrent agent mutation.
- [ ] Verify and capture 480 × 640, 900 × 700, and 1440 × 900 screenshots with no horizontal overflow.
- [ ] Update user documentation and record exact QA totals/results.
- [ ] Request independent code review and fix every critical or important issue.
- [ ] Run the full suite and `git diff --check`, then commit with `docs: verify cyber investigation workflow`.

### Task 7: Final integration handoff

- [ ] Inspect `git diff --stat ad90295..HEAD`, the full diff, and branch history.
- [ ] Run the complete suite again from the clean committed branch.
- [ ] Confirm the worktree is clean and the reviewer verdict has no critical or important findings.
- [ ] Present local merge, pull request, and keep-branch options without merging or pushing automatically.
