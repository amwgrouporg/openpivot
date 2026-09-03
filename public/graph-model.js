function buildAdjacency(links) {
  const adjacency = new Map();
  for (const link of links ?? []) {
    if (!adjacency.has(link.from)) adjacency.set(link.from, []);
    if (!adjacency.has(link.to)) adjacency.set(link.to, []);
    adjacency.get(link.from).push({ other: link.to, linkId: link.id });
    adjacency.get(link.to).push({ other: link.from, linkId: link.id });
  }
  return adjacency;
}

function laterTimestamp(current, candidate) {
  if (!candidate || Number.isNaN(Date.parse(candidate))) return current;
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return current;
}

const ACTIVITY_WINDOWS = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };
const LANE_TYPES = ["domain", "url", "ip", "org", "document", "claim"];
const RELATIONSHIP_TYPES = ["resolves_to", "uses_nameserver", "registered_through", "hosted_on", "redirects_to", "references", "observed_with", "associated_with", "custom"];
const SYMMETRIC_TYPES = new Set(["observed_with", "associated_with"]);

function isInActivityWindow(timestamp, cutoff) {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) && value >= cutoff;
}

function activeEntityIds(caseData, links, cutoff) {
  const active = new Set();
  for (const entity of caseData.entities ?? []) if (isInActivityWindow(entity.added_at, cutoff)) active.add(entity.id);
  for (const reading of caseData.readings ?? []) if (isInActivityWindow(reading.fetched_at, cutoff)) active.add(reading.entity_id);
  for (const evidence of caseData.evidence ?? []) {
    if (isInActivityWindow(evidence.captured_at, cutoff)) for (const entityId of evidence.entity_ids ?? []) active.add(entityId);
  }
  for (const link of links ?? []) {
    if (isInActivityWindow(link.at, cutoff) || isInActivityWindow(link.reviewed_at, cutoff)) {
      active.add(link.from);
      active.add(link.to);
    }
  }
  return active;
}

function activeLinkIds(links, cutoff) {
  return new Set(links.filter((link) => isInActivityWindow(link.at, cutoff) || isInActivityWindow(link.reviewed_at, cutoff)).map((link) => link.id));
}

export function nodeMetadata(caseData, links = caseData.links) {
  const metadata = new Map((caseData.entities ?? []).map((entity) => [entity.id, {
    collectionStatus: "none",
    evidenceCount: 0,
    relationshipCount: 0,
    lastCaseActivityAt: laterTimestamp(null, entity.added_at),
  }]));

  for (const reading of caseData.readings ?? []) {
    const item = metadata.get(reading.entity_id);
    if (!item) continue;
    if (reading.status === "indeterminate") item.collectionStatus = "indeterminate";
    else if (reading.status === "ok" && item.collectionStatus === "none") item.collectionStatus = "ok";
    item.lastCaseActivityAt = laterTimestamp(item.lastCaseActivityAt, reading.fetched_at);
  }
  for (const evidence of caseData.evidence ?? []) {
    for (const entityId of evidence.entity_ids ?? []) {
      const item = metadata.get(entityId);
      if (!item) continue;
      item.evidenceCount += 1;
      item.lastCaseActivityAt = laterTimestamp(item.lastCaseActivityAt, evidence.captured_at);
    }
  }
  for (const link of links ?? []) {
    for (const entityId of [link.from, link.to]) {
      const item = metadata.get(entityId);
      if (item) {
        item.relationshipCount += 1;
        item.lastCaseActivityAt = laterTimestamp(item.lastCaseActivityAt, link.at);
        item.lastCaseActivityAt = laterTimestamp(item.lastCaseActivityAt, link.reviewed_at);
      }
    }
  }
  return metadata;
}

export function neighborhoodIds(links, seedId, depth) {
  const adjacency = buildAdjacency(links);
  const seen = new Set([seedId]);
  let frontier = [seedId];
  for (let hop = 0; hop < depth; hop += 1) {
    frontier = frontier.flatMap((id) => [...(adjacency.get(id) ?? [])]
      .map((edge) => edge.other).filter((id) => !seen.has(id) && seen.add(id)));
  }
  return seen;
}

export function shortestPath(links, startId, endId) {
  const adjacency = buildAdjacency(links);
  if (!adjacency.has(startId) || !adjacency.has(endId)) return null;
  if (startId === endId) return { nodeIds: [startId], linkIds: [] };

  const predecessors = new Map();
  const queue = [startId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const edge of adjacency.get(current)) {
      if (edge.other === startId || predecessors.has(edge.other)) continue;
      predecessors.set(edge.other, { nodeId: current, linkId: edge.linkId });
      if (edge.other === endId) {
        const nodeIds = [endId];
        const linkIds = [];
        for (let nodeId = endId; nodeId !== startId;) {
          const predecessor = predecessors.get(nodeId);
          nodeIds.unshift(predecessor.nodeId);
          linkIds.unshift(predecessor.linkId);
          nodeId = predecessor.nodeId;
        }
        return { nodeIds, linkIds };
      }
      queue.push(edge.other);
    }
  }
  return null;
}

export function connectedComponents(nodes, links) {
  const adjacency = buildAdjacency(links);
  const nodeIds = [...new Set((nodes ?? []).map((node) => node.id))].sort();
  const known = new Set(nodeIds);
  const visited = new Set();
  const components = [];

  for (const seedId of nodeIds) {
    if (visited.has(seedId)) continue;
    const component = [];
    const queue = [seedId];
    visited.add(seedId);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      component.push(current);
      for (const edge of adjacency.get(current) ?? []) {
        if (known.has(edge.other) && !visited.has(edge.other)) {
          visited.add(edge.other);
          queue.push(edge.other);
        }
      }
    }
    components.push(component.sort());
  }
  return components.sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
}

export function parallelEdgeOffsets(links) {
  const grouped = new Map();
  for (const link of links ?? []) {
    const key = [link.from, link.to].sort().join("\u0000");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(link);
  }
  const offsets = new Map();
  for (const [, group] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    group.sort((left, right) => {
      const typeDifference = (RELATIONSHIP_TYPES.indexOf(left.relationship_type) + 1 || RELATIONSHIP_TYPES.length)
        - (RELATIONSHIP_TYPES.indexOf(right.relationship_type) + 1 || RELATIONSHIP_TYPES.length);
      if (typeDifference) return typeDifference;
      const directionDifference = `${left.from}\u0000${left.to}`.localeCompare(`${right.from}\u0000${right.to}`);
      return directionDifference || String(left.id).localeCompare(String(right.id));
    });
    const middle = (group.length - 1) / 2;
    group.forEach((link, index) => offsets.set(link.id, (index - middle) * 18));
  }
  return offsets;
}

export function labelModeForCount(count, requested = "auto") {
  if (requested !== "auto") return requested;
  if (count < 60) return "all";
  if (count <= 150) return "neighbors";
  return "focus";
}

export function filterGraph(caseData, filters = {}) {
  const allowedTypes = filters.types?.length ? new Set(filters.types) : null;
  const allowedStatuses = filters.statuses?.length
    ? new Set(filters.statuses)
    : new Set(filters.includeRejected ? ["accepted", "proposed", "rejected"] : ["accepted", "proposed"]);
  let nodes = (caseData.entities ?? []).filter((entity) => !allowedTypes || allowedTypes.has(entity.type));
  let nodeIds = new Set(nodes.map((node) => node.id));
  let links = (caseData.links ?? []).filter((link) => allowedStatuses.has(link.status) && nodeIds.has(link.from) && nodeIds.has(link.to));
  const eligibleLinks = links;

  const windowMs = ACTIVITY_WINDOWS[filters.activityWindow];
  let activeLinks = new Set();
  if (windowMs) {
    const now = Date.parse(filters.now);
    const cutoff = now - windowMs;
    const activeIds = activeEntityIds(caseData, eligibleLinks, cutoff);
    nodes = nodes.filter((node) => activeIds.has(node.id));
    nodeIds = new Set(nodes.map((node) => node.id));
    activeLinks = activeLinkIds(links, cutoff);
    links = links.filter((link) => nodeIds.has(link.from) && nodeIds.has(link.to));
  }

  const hops = Number(filters.hops);
  if (filters.selectedId && (hops === 1 || hops === 2)) {
    const neighborhood = nodeIds.has(filters.selectedId) ? neighborhoodIds(links, filters.selectedId, hops) : new Set();
    nodes = nodes.filter((node) => neighborhood.has(node.id));
    nodeIds = new Set(nodes.map((node) => node.id));
    links = links.filter((link) => nodeIds.has(link.from) && nodeIds.has(link.to));
  }

  const metadata = nodeMetadata(caseData, eligibleLinks);
  const offsets = parallelEdgeOffsets(links);
  const density = {
    nodeCount: nodes.length,
    linkCount: links.length,
    reduceLabels: labelModeForCount(nodes.length, "auto") !== "all",
    message: nodes.length < 60 ? "" : `Showing ${nodes.length} entities and ${links.length} relationships; canvas labels are reduced for graph density.`,
  };
  return {
    nodes: nodes.map((node) => ({
      ...node,
      metadata: metadata.get(node.id),
      position: caseData.ui?.graph_positions?.[node.id] ?? null,
    })),
    links: links.map((link) => ({
      ...link,
      directional: !SYMMETRIC_TYPES.has(link.relationship_type),
      curveOffset: offsets.get(link.id) ?? 0,
      contextual: windowMs ? !activeLinks.has(link.id) : false,
    })),
    density,
  };
}

export function layoutTargets(nodes, links, options = {}) {
  const layout = options.layout ?? options.mode ?? "force";
  const width = options.width ?? 600;
  const height = options.height ?? 400;
  if (layout === "force") {
    return new Map((nodes ?? [])
      .filter((node) => Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y))
      .map((node) => [node.id, { x: node.position.x, y: node.position.y }]));
  }
  if (layout === "lanes") {
    const lanes = new Map(LANE_TYPES.map((type, index) => [type, index]));
    const ordered = [...(nodes ?? [])].sort((left, right) => (lanes.get(left.type) ?? LANE_TYPES.length) - (lanes.get(right.type) ?? LANE_TYPES.length) || left.id.localeCompare(right.id));
    const groups = new Map();
    for (const node of ordered) {
      const lane = lanes.get(node.type) ?? LANE_TYPES.length;
      if (!groups.has(lane)) groups.set(lane, []);
      groups.get(lane).push(node);
    }
    const targets = new Map();
    for (const [lane, group] of groups) {
      group.forEach((node, index) => targets.set(node.id, {
        x: (lane + 1) * width / (LANE_TYPES.length + 1),
        y: (index + 1) * height / (group.length + 1),
      }));
    }
    return targets;
  }
  if (layout === "radial") {
    const nodeIds = new Set((nodes ?? []).map((node) => node.id));
    if (!nodeIds.has(options.selectedId)) return new Map();
    const adjacency = buildAdjacency(links);
    const depths = new Map([[options.selectedId, 0]]);
    const queue = [options.selectedId];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const edge of adjacency.get(current) ?? []) {
        if (nodeIds.has(edge.other) && !depths.has(edge.other)) {
          depths.set(edge.other, depths.get(current) + 1);
          queue.push(edge.other);
        }
      }
    }
    const outerDepth = Math.max(...depths.values()) + 1;
    const rings = new Map();
    for (const nodeId of nodeIds) {
      const depth = depths.get(nodeId) ?? outerDepth;
      if (!rings.has(depth)) rings.set(depth, []);
      rings.get(depth).push(nodeId);
    }
    const targets = new Map();
    for (const [depth, ids] of [...rings.entries()].sort((left, right) => left[0] - right[0])) {
      ids.sort().forEach((nodeId, index) => {
        const angle = depth === 0 ? 0 : (index / ids.length) * Math.PI * 2;
        targets.set(nodeId, {
          x: width / 2 + Math.cos(angle) * depth * 90,
          y: height / 2 + Math.sin(angle) * depth * 90,
        });
      });
    }
    return targets;
  }
  return new Map();
}
