import { addEntity, addLink, dismissCandidate, findEntity, removeEntity, restoreCandidate, restoreRemoval, setLinkStatus } from "../store.js";

export function createCaseActions({ getCase, persist, setUi, runEntityPivot }) {
  let removalSnapshot = null;
  const save = () => persist(getCase());

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
    removeEntity(id) {
      removalSnapshot = removeEntity(getCase(), id, "human");
      setUi({ selected: null });
      save();
      return removalSnapshot;
    },
    undoRemoval() {
      if (!removalSnapshot) throw new Error("nothing to undo");
      restoreRemoval(getCase(), removalSnapshot);
      setUi({ selected: removalSnapshot.entity.id });
      removalSnapshot = null;
      save();
    },
  };
}

export function parseCandidate(element) {
  try { return JSON.parse(element.dataset.candidate); }
  catch { throw new Error("candidate data is invalid"); }
}
