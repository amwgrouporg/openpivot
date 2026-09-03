import { addEntity, addEvidence, addLink, dismissCandidate, findEntity, removeEntity, restoreCandidate, restoreRemoval, setFindingsField, setLinkStatus, setMemo, updateCaseBrief, updateEntityNotes } from "../store.js";

export function commandKeyAction(event, state = {}) {
  if (state.modalOpen) return null;
  if (String(event?.key ?? "").toLowerCase() === "k" && (event?.metaKey || event?.ctrlKey)) return "open-search";
  if (event?.key === "Escape" && state.searchOpen) return "close-search";
  return null;
}

export function createCaseActions({ getCase, persist, setUi, runEntityPivot }) {
  let removalSnapshot = null;
  const save = ({ preserveUndo = false } = {}) => {
    if (!preserveUndo) removalSnapshot = null;
    return persist(getCase());
  };

  return {
    selectEntity(id) {
      const entity = findEntity(getCase(), id);
      if (!entity) throw new Error("entity not found");
      setUi({ selected: id, view: "entities" });
      save({ preserveUndo: true });
      return entity;
    },
    addEntity(input) {
      const result = addEntity(getCase(), input, "human");
      setUi({ selected: result.entity.id, view: "entities" });
      save();
      return result.entity;
    },
    addCandidate(parentId, candidate) {
      const result = addEntity(getCase(), { ...candidate, notes: candidate.notes ?? candidate.why }, "human");
      setUi({ selected: result.entity.id });
      save();
      return result.entity;
    },
    addAndProposeCandidate(parentId, candidate) {
      const result = addEntity(getCase(), { ...candidate, notes: candidate.notes ?? candidate.why }, "human");
      if (result.created) {
        const citations = candidate.source_reading_id ? [{ kind: "reading", id: candidate.source_reading_id }] : [];
        const why = String(candidate.why ?? "").toLowerCase();
        const relationship_type = why.includes("a record") || why.includes("aaaa") ? "resolves_to" : why.includes("nameserver") ? "uses_nameserver" : why.includes("registrar") ? "registered_through" : why.includes("outbound link") ? "references" : "associated_with";
        addLink(getCase(), { from: parentId, to: result.entity.id, relationship_type, rationale: candidate.why || "Lead surfaced by collection", citations }, "human", "proposed");
      }
      setUi({ selected: result.entity.id });
      save();
      return result.entity;
    },
    dismissCandidate(parentId, candidate, key) {
      dismissCandidate(getCase(), key);
      save();
      return { parentId, candidate, key };
    },
    restoreCandidate(key) {
      restoreCandidate(getCase(), key);
      save();
    },
    editEntityNotes(id, notes) {
      const entity = updateEntityNotes(getCase(), id, notes, "human");
      save();
      return entity;
    },
    async runPivot(id, archive = false) {
      const entity = findEntity(getCase(), id);
      if (!entity) throw new Error("entity not found");
      return runEntityPivot(entity, entity.type, archive, "human");
    },
    setRelationshipStatus(id, status) {
      const link = setLinkStatus(getCase(), id, status, "human");
      save();
      return link;
    },
    createRelationship(input) {
      const result = addLink(getCase(), input, "human", "proposed");
      save();
      return result.link;
    },
    attachEvidence(input) {
      const evidence = addEvidence(getCase(), input, "human");
      save();
      return evidence;
    },
    saveAnalystMemo(text) {
      setMemo(getCase(), "human", text);
      save();
      return getCase().memo.human;
    },
    saveCaseBrief(input) {
      const brief = updateCaseBrief(getCase(), input, "human");
      save();
      return brief;
    },
    saveFindingsField(field, text) {
      setFindingsField(getCase(), field, text, "human");
      save();
      return getCase().memo[field];
    },
    addSelectedLeads(leads) {
      const added = [];
      for (const lead of leads) added.push(addEntity(getCase(), { ...lead.candidate, notes: lead.candidate.notes ?? lead.candidate.why }, "human").entity);
      save();
      return added;
    },
    dismissSelectedLeads(leads) {
      for (const lead of leads) dismissCandidate(getCase(), lead.key);
      save();
      return leads.length;
    },
    removeEntity(id) {
      removalSnapshot = removeEntity(getCase(), id, "human");
      setUi({ selected: null });
      save({ preserveUndo: true });
      return removalSnapshot;
    },
    undoRemoval() {
      if (!removalSnapshot) throw new Error("nothing to undo");
      restoreRemoval(getCase(), removalSnapshot);
      setUi({ selected: removalSnapshot.entity.id });
      removalSnapshot = null;
      save();
    },
    invalidateUndo() { removalSnapshot = null; },
  };
}

export function parseCandidate(element) {
  try { return JSON.parse(element.dataset.candidate); }
  catch { throw new Error("candidate data is invalid"); }
}

export function captureFormState(root) {
  if (!root) return null;
  const controls = [...root.querySelectorAll("input[id], input[name], textarea[id], textarea[name], select[id], select[name]")];
  const active = root.ownerDocument?.activeElement;
  return {
    controls: controls.map((control, index) => ({
      key: control.id ? `id:${control.id}` : `name:${control.name}:${index}`,
      value: control.value,
      checked: Boolean(control.checked),
      selectedValues: control.multiple ? [...control.options].filter((option) => option.selected).map((option) => option.value) : null,
    })),
    activeKey: active ? (active.id ? `id:${active.id}` : controls.includes(active) ? `name:${active.name}:${controls.indexOf(active)}` : null) : null,
    selection: active && Number.isInteger(active.selectionStart) ? [active.selectionStart, active.selectionEnd] : null,
  };
}

export function restoreFormState(root, state) {
  if (!root || !state) return;
  const controls = [...root.querySelectorAll("input[id], input[name], textarea[id], textarea[name], select[id], select[name]")];
  const byKey = new Map(controls.map((control, index) => [control.id ? `id:${control.id}` : `name:${control.name}:${index}`, control]));
  for (const saved of state.controls) {
    const control = byKey.get(saved.key);
    if (!control) continue;
    if (control.type === "checkbox" || control.type === "radio") control.checked = saved.checked;
    else if (control.multiple && saved.selectedValues) [...control.options].forEach((option) => { option.selected = saved.selectedValues.includes(option.value); });
    else control.value = saved.value;
  }
  const active = byKey.get(state.activeKey);
  if (active) {
    active.focus?.();
    if (state.selection && typeof active.setSelectionRange === "function") active.setSelectionRange(...state.selection);
  }
}

export function leadTriageFocusSelector(root) {
  return root?.querySelector?.(".lead-triage-toolbar") ? ".lead-triage-toolbar" : ".main-surface h1";
}

export function resetTransientUi(ui) {
  ui.selected = null;
  ui.activeRun = null;
  ui.evidenceDraft = null;
  ui.toast = null;
  ui.modal = null;
  ui.returnFocus = null;
  ui.focusRelationship = null;
  ui.pathMode = false;
  ui.pathStartId = null;
  ui.pathEndId = null;
  ui.path = null;
  ui.skipFormRestore = true;
  if ("searchQuery" in ui) ui.searchQuery = "";
  if ("searchOpen" in ui) ui.searchOpen = false;
  if ("searchReturnFocus" in ui) ui.searchReturnFocus = null;
  if (ui.selectedLeadKeys?.clear) ui.selectedLeadKeys.clear();
  return ui;
}
