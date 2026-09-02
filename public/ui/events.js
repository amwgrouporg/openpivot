import { addEntity, addEvidence, addLink, dismissCandidate, findEntity, removeEntity, restoreCandidate, restoreRemoval, setLinkStatus, setMemo, updateEntityNotes } from "../store.js";

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
      return entity;
    },
    addEntity(input) {
      const result = addEntity(getCase(), input, "human");
      setUi({ selected: result.entity.id, view: "entities" });
      save();
      return result.entity;
    },
    addCandidate(parentId, candidate) {
      const result = addEntity(getCase(), candidate, "human");
      setUi({ selected: result.entity.id });
      save();
      return result.entity;
    },
    addAndProposeCandidate(parentId, candidate) {
      const result = addEntity(getCase(), candidate, "human");
      if (result.created) {
        const citations = candidate.source_reading_id ? [{ kind: "reading", id: candidate.source_reading_id }] : [];
        addLink(getCase(), { from: parentId, to: result.entity.id, rationale: candidate.why || "Candidate discovered from a pivot", citations }, "human", "proposed");
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
