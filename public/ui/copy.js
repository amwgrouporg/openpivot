export const COPY = {
  navigation: [
    { id: "overview", label: "Case overview", icon: "overview" },
    { id: "entities", label: "Entities", icon: "entities" },
    { id: "relationships", label: "Relationships", icon: "relationships" },
    { id: "evidence", label: "Evidence", icon: "evidence" },
    { id: "report", label: "Findings", icon: "report" },
  ],
  collection: {
    ok: "Retrieved",
    indeterminate: "Collection inconclusive",
    running: "Collection in progress",
    queued: "Queued for collection",
  },
  relationshipStatus: {
    proposed: "Pending analyst review",
    accepted: "Accepted into case",
    rejected: "Rejected by analyst",
  },
  relationshipTypes: {
    resolves_to: "resolves to",
    uses_nameserver: "uses nameserver",
    registered_through: "registered through",
    hosted_on: "hosted on",
    redirects_to: "redirects to",
    references: "references",
    observed_with: "observed with",
    associated_with: "associated with",
    custom: "custom relationship",
  },
};

export function collectionStatusLabel(status) {
  return COPY.collection[status] ?? String(status ?? "Unknown collection state");
}

export function relationshipStatusLabel(status) {
  return COPY.relationshipStatus[status] ?? String(status ?? "Unknown review state");
}

export function relationshipTypeLabel(type) {
  return COPY.relationshipTypes[type] ?? COPY.relationshipTypes.custom;
}
