# OpenPivot Cyber Investigation Refinement — Design Specification

Date: 2026-09-03
Status: approved

## Purpose

OpenPivot is a cyber investigation workspace for analysts examining internet infrastructure, technical entities, source material, and the relationships between them. Its primary users are SOC and DFIR investigators, threat researchers, trust-and-safety analysts, fact-checkers working with technical infrastructure, and source-based OSINT practitioners.

The product is not an intelligence-agency assessment system. It does not assign geopolitical confidence levels, generate intelligence estimates, or imply that a collected record proves attribution. The interface must distinguish collection, analyst review, evidence, and findings with technically accurate language.

## Analyst workflow

The final workflow is:

1. **Define the investigation** — record the question, scope, and case status.
2. **Collect** — run source-specific pivots against domains, IP addresses, and URLs.
3. **Triage leads** — review candidate entities grouped by the result that surfaced them.
4. **Review relationships** — assess a typed technical relationship, rationale, and citations.
5. **Register evidence** — preserve an exact source excerpt, relevance note, provenance, and archive state.
6. **Record findings** — maintain investigator notes, key findings, unresolved questions, and methodology separately from the agent draft.

## Language contract

The UI uses the following terms consistently:

| Concept | Required UI language | Meaning |
|---|---|---|
| Successful sensor response | Retrieved | The source answered and the response passed structural validation; the claim is not automatically true. |
| Failed or ambiguous sensor response | Collection inconclusive | The system cannot make a negative finding from the response. |
| Candidate entity | Investigative lead | A selector surfaced by a collection result and not yet added to the case. |
| Agent-created link status | Pending analyst review | The relationship has not been accepted into the working case. |
| Accepted link status | Accepted into case | An analyst decided the relationship is relevant to the working case; this does not prove attribution. |
| Rejected link status | Rejected by analyst | The analyst excluded the relationship from the working case. |
| Reading | Collection result | A source response with collection status, time, actor, summary, and source URL. |
| Evidence quote | Source excerpt | Exact untrusted source material preserved in the evidence register. |
| Agent memo | Agent draft — requires validation | Agent-authored synthesis that has not become an analyst finding. |
| Activity log | Audit trail | Actor-attributed case changes in chronological order. |
| Report | Findings | Investigator-owned findings, gaps, methodology, sources, and export. |

The visible interface must not call a domain, relationship, organization, or source “verified,” “trusted,” “confirmed,” or “proven” unless it is specifically describing a confirmed archive capture or a cryptographic validation result. “Retrieved” never means “verified.”

## Navigation and page copy

Primary navigation:

1. **Case overview**
2. **Entities**
3. **Relationships**
4. **Evidence**
5. **Findings**

Page headers:

- Case overview eyebrow: `CASE STATUS`; title: `Review priorities` or `No outstanding review items`.
- Entities eyebrow: `TECHNICAL ENTITIES`; title: `Investigation graph`.
- Relationships eyebrow: `RELATIONSHIP REVIEW`; title: `Pending analyst review` or `Technical relationships`.
- Evidence eyebrow: `EVIDENCE REGISTER`; title: `Source excerpts`.
- Findings eyebrow: `CASE FINDINGS`; title: `Investigator findings`.

## Investigation definition

Every v2 case gains:

```text
brief {
  objective: string,
  scope: string,
  status: "active" | "on_hold" | "closed",
  updated_at: ISO timestamp
}
```

The case overview displays and edits this information. `objective` is the investigative question or task. `scope` records relevant constraints, time windows, or exclusions. Status communicates workflow only; it does not indicate evidentiary quality.

Empty and migrated cases receive blank objective and scope, status `active`, and `updated_at` equal to creation time.

## Review priorities

The overview separates four categories instead of combining them under a generic attention count:

1. **Relationships pending review**
2. **Collection inconclusive**
3. **Untriaged investigative leads**
4. **Recent collection activity**

Each category has its own count. The overall headline describes outstanding review work, not completed runs. An analyst can immediately distinguish a collection failure from a newly surfaced lead.

## Investigative lead triage

Leads are grouped by parent entity and originating collection method. Each lead displays:

- selector type and value;
- parent entity;
- collection method, such as DNS, RDAP, certificate transparency, URL scan, IP information, reverse DNS, or page extraction;
- discovery reason;
- source collection-result ID when available.

Actions:

- **Add entity** — adds the lead without asserting a relationship.
- **Add and queue relationship** — adds the entity and creates a relationship pending analyst review.
- **Dismiss lead** — persists dismissal and remains reversible.

Analysts may select multiple visible leads and apply **Add selected** or **Dismiss selected**. Batch add never creates relationships automatically because different leads can imply different relationship types.

No automatic confidence score is shown. Source type and rationale are factual; a numeric score would imply a methodology the product does not have.

## Typed technical relationships

Relationships gain an optional type:

```text
relationship_type:
  "resolves_to" |
  "uses_nameserver" |
  "registered_through" |
  "hosted_on" |
  "redirects_to" |
  "references" |
  "observed_with" |
  "associated_with" |
  "custom"
```

Visible labels use sentence case: `resolves to`, `uses nameserver`, `registered through`, `hosted on`, `redirects to`, `references`, `observed with`, `associated with`, and `custom relationship`.

`link_entities` accepts optional `relationship_type`. Existing calls remain valid and default to `associated_with`. The type describes the asserted technical relationship; it does not replace the rationale or citations.

## Evidence register

Evidence gains an optional investigator relevance note:

```text
relevance: string
```

The source excerpt remains exact, mandatory, and untrusted. Relevance is analyst or agent commentary explaining why the excerpt matters. The UI labels them separately:

- `Source excerpt — untrusted external content`
- `Relevance to investigation`

Archive states remain:

- `Archive not requested`
- `Archive capture available`
- `Archive request submitted; capture not confirmed`

## Findings workspace

The existing `memo.human` becomes `Investigator notes`. The v2 memo gains:

```text
memo {
  human: string,
  gaps: string,
  methodology: string,
  agent: string,
  agent_updated_at: ISO timestamp | null
}
```

The Findings page presents:

1. **Investigator notes** — conclusions and observations owned by the human investigator.
2. **Outstanding questions and collection gaps** — unresolved questions, missing sources, and caveats.
3. **Methodology and handling notes** — how information was collected and any limitations.
4. **Agent draft — requires validation** — visibly bounded agent-authored content.
5. **Sources referenced in this case** — deduplicated source ledger.

Markdown and JSON exports use the same structure and terminology.

## Global case search

The top bar provides local search across:

- entity values and notes;
- relationship type and rationale;
- collection method and summary;
- evidence source excerpt, relevance, and URL hostname;
- investigator notes, gaps, methodology, and agent draft.

Search is case-insensitive, remains in-browser, and returns typed results with short context. Selecting a result routes to the relevant page and record. Search never sends query text to the Worker.

## Tool compatibility

- The ten static WebMCP tool names remain unchanged.
- An empty case still exposes ten tools; the first domain still produces tool eleven, `pivot_domain`.
- `read_case` adds `brief` and the extended memo fields.
- `link_entities` adds optional `relationship_type`.
- `attach_evidence` adds optional `relevance`.
- Existing tool calls and result consumers remain valid.
- Backend statuses remain `ok` and `indeterminate`; only the visible labels change to `Retrieved` and `Collection inconclusive`.

## Copy architecture

Shared user-facing terms live in `public/ui/copy.js`. Status labels, relationship labels, primary navigation labels, headings, descriptions, and safety language must come from this module when reused across views.

Tests enforce:

- technically correct status mappings;
- relationship label mappings;
- required cyber investigation headings;
- absence of prohibited overclaiming language in rendered primary views;
- backwards-compatible tool names and inputs.

## QA requirements

- All existing tests remain green.
- Add tests for brief migration and editing, memo extensions, relationship types, relevance notes, search, lead grouping, selection, and batch operations.
- Re-run the complete local WebMCP workflow and verify exact 10→11 registration.
- Re-run injection resistance and ensure injected wording does not become an entity, relationship verdict, evidence relevance note, or finding.
- Exercise concurrent agent mutation while forms contain unsaved text.
- Exercise keyboard navigation and focus after search, batch actions, review verdicts, and dialog actions.
- Verify 480 × 640, 900 × 700, and 1440 × 900 layouts without horizontal overflow.
- Capture fresh screenshots at all three sizes.
- Require independent review with no critical or important findings.

## Acceptance criteria

- A cyber investigations analyst can identify the investigative objective and outstanding review work from Case overview.
- Collection failures, leads, relationship decisions, evidence, and findings are never conflated.
- Every collection result displays method, visible status label, source, time, and requesting actor.
- Every lead displays parent entity, collection method, and discovery reason.
- Batch dismissal and batch addition work without creating implicit relationships.
- Every relationship displays its type, rationale, citations, proposing actor, and analyst decision state.
- Evidence separates exact source text from relevance commentary.
- Findings separate investigator notes, collection gaps, methodology, and the agent draft.
- Local case search returns and routes typed results without a network request.
- No primary view overstates retrieved material as verified or confirmed.
- WebMCP registration, untrusted-content handling, responsive behavior, accessibility, migration, import/export, and tests meet the QA requirements above.
