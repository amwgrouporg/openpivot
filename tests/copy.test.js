import test from "node:test";
import assert from "node:assert/strict";
import { COPY, collectionStatusLabel, relationshipStatusLabel, relationshipTypeLabel } from "../public/ui/copy.js";

test("collection status language describes retrieval rather than truth", () => {
  assert.equal(collectionStatusLabel("ok"), "Retrieved");
  assert.equal(collectionStatusLabel("indeterminate"), "Collection inconclusive");
  assert.equal(collectionStatusLabel("running"), "Collection in progress");
});

test("relationship status language describes analyst workflow", () => {
  assert.equal(relationshipStatusLabel("proposed"), "Pending analyst review");
  assert.equal(relationshipStatusLabel("accepted"), "Accepted into case");
  assert.equal(relationshipStatusLabel("rejected"), "Rejected by analyst");
});

test("technical relationship types have precise visible labels", () => {
  assert.equal(relationshipTypeLabel("resolves_to"), "resolves to");
  assert.equal(relationshipTypeLabel("registered_through"), "registered through");
  assert.equal(relationshipTypeLabel("associated_with"), "associated with");
  assert.equal(relationshipTypeLabel("unknown"), "custom relationship");
});

test("primary navigation uses cyber investigation language", () => {
  assert.deepEqual(COPY.navigation.map((item) => item.label), ["Case overview", "Entities", "Relationships", "Evidence", "Findings"]);
});
