// D3 graph with a pure model boundary. The pure model keeps presentation,
// filtering, and persisted positions testable even when D3 is unavailable.
import {
  edgePresentation,
  filterGraph,
  labelModeForCount,
  layoutTargets,
  neighborhoodIds,
  nodeAccessibleName,
  relationshipAccessibleName,
} from "./graph-model.js";
import { ENTITY_GLYPHS } from "./ui/components.js";
import { relationshipTypeLabel } from "./ui/copy.js";

const COLORS = { domain: "#6ea8fe", ip: "#f2bd4a", url: "#59d48b", org: "#bd91ff", document: "#9aa7b7", claim: "#ff7b72" };
const EDGE_COLORS = { accepted: "#78a9d4", proposed: "#e6b85c", rejected: "#e77a73" };
const COLLECTION_COLORS = { ok: "#6ea8fe", indeterminate: "#e6b85c", none: "#60758c" };

function finite(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

function sourceCountLabel(link) {
  const count = link?.citations?.length ?? 0;
  return count ? `${count} ${count === 1 ? "source" : "sources"}` : "";
}

export function collectionColor(status) {
  return COLLECTION_COLORS[status] ?? COLLECTION_COLORS.none;
}

function idsFromDataset(value) {
  if (!value) return new Set();
  try {
    const parsed = JSON.parse(value);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function edgeDomId(id) {
  return `graph-edge-${String(id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function directedCurveOffset(link) {
  const offset = Number(link?.curveOffset) || 0;
  const from = link?.from ?? link?.source?.id;
  const to = link?.to ?? link?.target?.id;
  return from != null && to != null && String(from).localeCompare(String(to)) > 0 ? -offset : offset;
}

export function mergeGraphPositions(current, visible, { replace = false } = {}) {
  return replace ? { ...visible } : { ...(current ?? {}), ...(visible ?? {}) };
}

export function settleImmediately(simulation, paint) {
  simulation.alpha(1).tick(80).stop();
  paint();
}

export function applyNodeDrag(item, event, {
  reducedMotion = false,
  paint = () => {},
  ending = false,
  fixedPosition = null,
  publish = () => {},
} = {}) {
  item.x = ending ? fixedPosition?.x ?? event.x : event.x;
  item.y = ending ? fixedPosition?.y ?? event.y : event.y;
  item.fx = ending ? fixedPosition?.x ?? null : event.x;
  item.fy = ending ? fixedPosition?.y ?? null : event.y;
  if (reducedMotion) paint();
  if (ending) publish();
  return item;
}

export function applyLayoutFixations(nodes, {
  layout = "force",
  selectedId = null,
  width = 0,
  height = 0,
  preserveFixedIds = new Set(),
} = {}) {
  for (const node of nodes ?? []) {
    if (preserveFixedIds.has(node.id)) continue;
    const central = layout === "radial" && node.id === selectedId;
    node.fx = central ? width / 2 : null;
    node.fy = central ? height / 2 : null;
  }
  return nodes;
}

export function graphListModel(caseData, filters = {}) {
  const selectedId = filters.selectedId ?? filters.connectedTo;
  const hops = filters.hops ?? (filters.connectedTo ? 1 : "all");
  return filterGraph(caseData, { ...filters, selectedId, hops });
}

export function graphLabelIds(nodes, links, { requested = "auto", selectedId = null, hoveredId = null, pathNodeIds = [] } = {}) {
  const mode = labelModeForCount((nodes ?? []).length, requested);
  if (mode === "all") return new Set((nodes ?? []).map((node) => node.id));
  const ids = new Set(pathNodeIds ?? []);
  const focusIds = [...new Set([selectedId, hoveredId].filter(Boolean))];
  for (const id of focusIds) ids.add(id);
  if (mode === "focus") return ids;
  for (const focusId of focusIds) for (const link of links ?? []) {
    if (link.from === focusId) ids.add(link.to);
    if (link.to === focusId) ids.add(link.from);
  }
  return ids;
}

export function graphBadgeIds(nodes, links, options = {}) {
  const labelIds = graphLabelIds(nodes, links, options);
  return new Set((nodes ?? [])
    .filter((node) => (node.metadata?.evidenceCount ?? 0) > 0 && labelIds.has(node.id))
    .map((node) => node.id));
}

export function nodeLabelWidth(node) {
  return Math.min(30, String(node?.value ?? "").length) * 6.2 + 12;
}

export function nodeCollisionRadius(node, visibleLabelIds = new Set()) {
  return visibleLabelIds.has(node?.id) ? Math.max(34, nodeLabelWidth(node) / 2 + 6) : 34;
}

export function shouldPaintMinimap({ viewportWidth = Number.POSITIVE_INFINITY, renderedWidth = 0 } = {}) {
  return viewportWidth >= 1000 && renderedWidth > 0;
}

export function createPositionPublisher(readPositions, publish, {
  delay = 180,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let timer = null;
  let pending = false;
  const flush = () => {
    if (!pending) return false;
    pending = false;
    if (timer !== null) clearTimer(timer);
    timer = null;
    publish(readPositions());
    return true;
  };
  const schedule = () => {
    pending = true;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      flush();
    }, delay);
  };
  return { schedule, flush };
}

export function graphFocusDescriptor(activeElement) {
  const record = activeElement?.closest?.("[data-graph-entity-id], [data-graph-link-id]");
  if (record?.dataset?.graphEntityId) return { kind: "entity", id: record.dataset.graphEntityId };
  if (record?.dataset?.graphLinkId) return { kind: "link", id: record.dataset.graphLinkId };
  return null;
}

function attributeValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function restoreGraphFocus(root, descriptor) {
  if (!root || !descriptor?.id || !["entity", "link"].includes(descriptor.kind)) return false;
  const attribute = descriptor.kind === "entity" ? "data-graph-entity-id" : "data-graph-link-id";
  const target = root.querySelector?.(`[${attribute}="${attributeValue(descriptor.id)}"]`);
  target?.focus?.();
  return Boolean(target);
}

export function reconcileGraphNode(previous = {}, modelNode = {}, persistedPosition = {}) {
  const live = Number.isFinite(previous.x) && Number.isFinite(previous.y);
  const liveState = live ? { x: previous.x, y: previous.y, vx: previous.vx, vy: previous.vy, fx: previous.fx, fy: previous.fy } : null;
  Object.assign(previous, modelNode);
  if (liveState) Object.assign(previous, liveState);
  else Object.assign(previous, persistedPosition);
  return previous;
}

export function graphInteractionAccessibility(nodes, links, { pathNodeIds = [], pathLinkIds = [] } = {}) {
  const nodePath = pathNodeIds instanceof Set ? pathNodeIds : new Set(pathNodeIds);
  const linkPath = pathLinkIds instanceof Set ? pathLinkIds : new Set(pathLinkIds);
  return {
    nodeNames: new Map((nodes ?? []).map((node) => [node.id, nodeAccessibleName({ ...node, inPath: nodePath.has(node.id) })])),
    relationshipNames: new Map((links ?? []).map((link) => [link.id, relationshipAccessibleName(link, nodes, { inPath: linkPath.has(link.id) })])),
  };
}

export function graphEdgeLabelIds(nodes, links, {
  requested = "auto",
  selectedId = null,
  hoveredNodeId = null,
  selectedLinkId = null,
  hoveredLinkId = null,
  pathLinkIds = [],
} = {}) {
  const mode = labelModeForCount((nodes ?? []).length, requested);
  if (mode === "all") return new Set((links ?? []).map((link) => link.id));
  const ids = new Set(pathLinkIds ?? []);
  if (selectedLinkId) ids.add(selectedLinkId);
  if (hoveredLinkId) ids.add(hoveredLinkId);
  const focusId = hoveredNodeId ?? selectedId;
  if (!focusId) return ids;
  if (mode === "focus") {
    for (const link of links ?? []) if (link.from === focusId || link.to === focusId) ids.add(link.id);
    return ids;
  }
  const neighbors = neighborhoodIds(links, focusId, 1);
  for (const link of links ?? []) if (neighbors.has(link.from) && neighbors.has(link.to)) ids.add(link.id);
  return ids;
}

export function nodesForFit(nodes, selectedId = null, links = []) {
  if (!selectedId) return [...(nodes ?? [])];
  const ids = neighborhoodIds(links, selectedId, 1);
  return (nodes ?? []).filter((node) => ids.has(node.id));
}

export function edgePath(link) {
  const source = link?.source ?? {};
  const target = link?.target ?? {};
  const sourceX = finite(source.x);
  const sourceY = finite(source.y);
  const targetX = finite(target.x);
  const targetY = finite(target.y);
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy) || 1;
  const offset = directedCurveOffset(link);
  const controlX = finite((sourceX + targetX) / 2 - dy / distance * offset);
  const controlY = finite((sourceY + targetY) / 2 + dx / distance * offset);
  return `M${sourceX},${sourceY} Q${controlX},${controlY} ${targetX},${targetY}`;
}

function edgeMidpoint(link) {
  const source = link?.source ?? {};
  const target = link?.target ?? {};
  const sourceX = finite(source.x);
  const sourceY = finite(source.y);
  const targetX = finite(target.x);
  const targetY = finite(target.y);
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy) || 1;
  const offset = directedCurveOffset(link);
  const controlX = (sourceX + targetX) / 2 - dy / distance * offset;
  const controlY = (sourceY + targetY) / 2 + dx / distance * offset;
  return {
    x: finite((sourceX + 2 * controlX + targetX) / 4),
    y: finite((sourceY + 2 * controlY + targetY) / 4),
  };
}

export function nodeStateClasses(nodeId, context = {}) {
  const classes = ["graph-node"];
  const selected = nodeId === context.selectedId;
  const hovered = nodeId === context.hoveredId;
  const neighbor = context.neighborIds?.has(nodeId) ?? false;
  const inPath = context.pathNodeIds?.has(nodeId) ?? false;
  if (selected) classes.push("is-selected");
  if (hovered) classes.push("is-hovered");
  if (!selected && !hovered && neighbor) classes.push("is-neighbor");
  if (inPath) classes.push("is-path");
  if ((context.selectedId || context.hoveredId) && !selected && !hovered && !neighbor && !inPath) classes.push("is-dimmed");
  return classes.join(" ");
}

export function resetGraphLayoutNodes(nodes, links, { layout = "force", selectedId = null, width = 600, height = 400 } = {}) {
  if (layout === "force") {
    const items = nodes ?? [];
    const radius = items.length > 1 ? Math.min(width, height) * 0.22 : 0;
    for (const [index, node] of items.entries()) {
      node.fx = null;
      node.fy = null;
      const angle = items.length > 1 ? index / items.length * Math.PI * 2 - Math.PI / 2 : 0;
      node.x = width / 2 + Math.cos(angle) * radius;
      node.y = height / 2 + Math.sin(angle) * radius;
    }
    return nodes;
  }
  const targets = layoutTargets(nodes, links, { layout, selectedId, width, height });
  for (const node of nodes ?? []) {
    const target = targets.get(node.id);
    if (!target) continue;
    node.x = target.x;
    node.y = target.y;
    node.fx = target.x;
    node.fy = target.y;
  }
  return nodes;
}

export function createGraph(svgEl, options = {}) {
  const onSelectEntity = options.onSelectEntity ?? options.onSelect ?? (() => {});
  const onSelectLink = options.onSelectLink ?? (() => {});
  const onHoverEntity = options.onHoverEntity ?? (() => {});
  const onHoverLink = options.onHoverLink ?? (() => {});
  const onZoomChange = options.onZoomChange ?? (() => {});
  const onPositionsChange = options.onPositionsChange ?? (() => {});
  const reducedMotion = options.reducedMotion ?? false;
  const card = svgEl?.closest?.(".graph-card") ?? svgEl?.parentElement;
  const unavailable = card?.querySelector?.("[data-graph-unavailable]");
  const semanticAlternative = card?.querySelector?.("[data-graph-semantic]");
  const hoverStatus = card?.querySelector?.("[data-graph-hover-status]");
  const zoomStatus = card?.querySelector?.("[data-graph-zoom]");

  if (typeof d3 === "undefined" || !svgEl) {
    if (unavailable) unavailable.hidden = false;
    if (semanticAlternative) {
      semanticAlternative.classList.add("graph-semantic-fallback");
      semanticAlternative.open = true;
    }
    return { update() {}, updateInteraction() {}, select() {}, selectEntity() {}, selectLink() {}, fit() {}, fitSelection() {}, zoom() {}, resetLayout() {}, flushPositions() {}, focusEntity() { return false; }, focusLink() { return false; }, destroy() {}, colors: COLORS, unavailable: true };
  }

  const svg = d3.select(svgEl);
  const minimapEl = card?.querySelector?.("svg.graph-minimap") ?? null;
  const minimap = minimapEl ? d3.select(minimapEl) : null;
  const definitions = svg.append("defs");
  const markerData = ["accepted", "proposed", "rejected"];
  const markers = definitions.selectAll("marker.graph-arrow").data(markerData).enter().append("marker")
    .attr("class", "graph-arrow")
    .attr("id", (status) => `arrow-${status}`)
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 25)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .attr("markerUnits", "userSpaceOnUse");
  markers.append("path").attr("d", "M0,-4L8,0L0,4Z").attr("fill", (status) => EDGE_COLORS[status]);

  const root = svg.append("g").attr("class", "graph-root");
  const linkLayer = root.append("g").attr("class", "graph-links");
  const nodeLayer = root.append("g").attr("class", "graph-nodes");
  const minimapRoot = minimap?.append("g").attr("class", "graph-minimap-root") ?? null;
  const minimapLinks = minimapRoot?.append("g").attr("class", "graph-minimap-links") ?? null;
  const minimapNodes = minimapRoot?.append("g").attr("class", "graph-minimap-nodes") ?? null;
  const minimapViewport = minimapRoot?.append("rect").attr("class", "graph-minimap-viewport") ?? null;

  let width = svgEl.clientWidth || 600;
  let height = svgEl.clientHeight || 400;
  let selectedEntityId = null;
  let selectedLinkId = null;
  let hoveredEntityId = null;
  let hoveredLinkId = null;
  let nodesRef = [];
  let linksRef = [];
  let allNodesRef = null;
  let allLinksRef = null;
  let labelIdsRef = new Set();
  let pathNodeIdsRef = new Set();
  let pathLinkIdsRef = new Set();
  let requestedLabels = "auto";
  let activeLayout = "force";
  let activeLayoutLinks = [];
  let activeLayoutSelectedId = null;
  let activeTargets = new Map();
  let paintNodes = () => {};
  const draggingNodeIds = new Set();
  let currentTransform = d3.zoomIdentity;
  let minimapState = null;
  const positions = new Map();

  function snapshotPositions() {
    const saved = {};
    for (const node of nodesRef) if (Number.isFinite(node.x) && Number.isFinite(node.y)) saved[node.id] = { x: Math.round(node.x), y: Math.round(node.y) };
    return saved;
  }

  const positionPublisher = createPositionPublisher(snapshotPositions, (saved) => onPositionsChange(saved, { replace: false }));

  function paintMinimap() {
    const viewportWidth = svgEl.ownerDocument?.defaultView?.innerWidth ?? Number.POSITIVE_INFINITY;
    const renderedWidth = minimapEl?.clientWidth ?? 0;
    if (!minimap || !nodesRef.length || !shouldPaintMinimap({ viewportWidth, renderedWidth })) return;
    const miniWidth = minimapEl.clientWidth || 190;
    const miniHeight = minimapEl.clientHeight || 116;
    const xs = nodesRef.map((node) => Number.isFinite(node.x) ? node.x : 0);
    const ys = nodesRef.map((node) => Number.isFinite(node.y) ? node.y : 0);
    const minX = Math.min(...xs) - 45;
    const maxX = Math.max(...xs) + 45;
    const minY = Math.min(...ys) - 45;
    const maxY = Math.max(...ys) + 45;
    const scale = Math.min((miniWidth - 12) / Math.max(1, maxX - minX), (miniHeight - 12) / Math.max(1, maxY - minY));
    const offsetX = (miniWidth - (maxX - minX) * scale) / 2;
    const offsetY = (miniHeight - (maxY - minY) * scale) / 2;
    const projectX = (x) => offsetX + ((x ?? 0) - minX) * scale;
    const projectY = (y) => offsetY + ((y ?? 0) - minY) * scale;
    minimapState = { minX, minY, scale, offsetX, offsetY };

    const miniLink = minimapLinks.selectAll("line").data(linksRef, (item) => item.id);
    miniLink.exit().remove();
    miniLink.enter().append("line").merge(miniLink)
      .attr("x1", (item) => projectX(item.source.x)).attr("y1", (item) => projectY(item.source.y))
      .attr("x2", (item) => projectX(item.target.x)).attr("y2", (item) => projectY(item.target.y));
    const miniNode = minimapNodes.selectAll("circle").data(nodesRef, (item) => item.id);
    miniNode.exit().remove();
    miniNode.enter().append("circle").attr("r", 2.25).merge(miniNode)
      .attr("cx", (item) => projectX(item.x)).attr("cy", (item) => projectY(item.y))
      .attr("fill", (item) => COLORS[item.type] ?? "#9aa7b7");

    const left = -currentTransform.x / currentTransform.k;
    const top = -currentTransform.y / currentTransform.k;
    minimapViewport
      .attr("x", projectX(left))
      .attr("y", projectY(top))
      .attr("width", Math.max(3, width / currentTransform.k * scale))
      .attr("height", Math.max(3, height / currentTransform.k * scale));
  }

  function emitZoom(transform) {
    const percentage = Math.round(transform.k * 100);
    if (zoomStatus) zoomStatus.textContent = `${percentage}%`;
    onZoomChange(percentage);
  }

  const zoomBehaviour = d3.zoom().scaleExtent([0.25, 4]).on("zoom", (event) => {
    currentTransform = event.transform;
    root.attr("transform", currentTransform);
    emitZoom(currentTransform);
    paintMinimap();
  });
  svg.call(zoomBehaviour).on("dblclick.zoom", null);

  function recenterFromMinimap(event) {
    if (!minimapState) return;
    const sourceEvent = event.sourceEvent ?? event;
    const [pointerX, pointerY] = d3.pointer(sourceEvent, minimapEl);
    const worldX = minimapState.minX + (pointerX - minimapState.offsetX) / minimapState.scale;
    const worldY = minimapState.minY + (pointerY - minimapState.offsetY) / minimapState.scale;
    const next = d3.zoomIdentity
      .translate(width / 2 - currentTransform.k * worldX, height / 2 - currentTransform.k * worldY)
      .scale(currentTransform.k);
    svg.call(zoomBehaviour.transform, next);
  }
  if (minimap) {
    minimap.attr("viewBox", "0 0 190 116").attr("preserveAspectRatio", "none")
      .on("click", recenterFromMinimap)
      .call(d3.drag().on("drag", recenterFromMinimap));
  }

  const simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id((node) => node.id).distance(105).strength(0.62))
    .force("charge", d3.forceManyBody().strength(-290))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(() => width / 2).strength(0.045))
    .force("y", d3.forceY(() => height / 2).strength(0.045))
    .force("collide", d3.forceCollide((node) => nodeCollisionRadius(node, labelIdsRef)));

  function publishPositions() {
    positionPublisher.schedule();
  }

  function neighborIds() {
    const focusId = hoveredEntityId ?? selectedEntityId;
    return focusId ? neighborhoodIds(activeLayoutLinks, focusId, 1) : new Set();
  }

  function renderHoverStatus(kind, item) {
    if (hoverStatus) {
      hoverStatus.textContent = !item
        ? "Hover or focus an entity or relationship for details."
        : kind === "entity"
          ? nodeAccessibleName({ ...item, inPath: pathNodeIdsRef.has(item.id) })
          : relationshipAccessibleName(item, nodesRef, { inPath: pathLinkIdsRef.has(item.id) });
    }
    if (kind === "entity") onHoverEntity(item ?? null);
    if (kind === "link") onHoverLink(item ?? null);
  }

  function applyPresentation() {
    const neighbors = neighborIds();
    const accessibility = graphInteractionAccessibility(nodesRef, activeLayoutLinks, { pathNodeIds: pathNodeIdsRef, pathLinkIds: pathLinkIdsRef });
    labelIdsRef = graphLabelIds(nodesRef, activeLayoutLinks, {
      requested: requestedLabels,
      selectedId: selectedEntityId,
      hoveredId: hoveredEntityId,
      pathNodeIds: pathNodeIdsRef,
    });
    const badgeIds = graphBadgeIds(nodesRef, activeLayoutLinks, {
      requested: requestedLabels,
      selectedId: selectedEntityId,
      hoveredId: hoveredEntityId,
      pathNodeIds: pathNodeIdsRef,
    });
    simulation.force("collide").radius((node) => nodeCollisionRadius(node, labelIdsRef));
    if (!reducedMotion && hoveredEntityId && simulation.alpha() < 0.08) simulation.alpha(0.08).restart();
    if (allNodesRef) {
      const context = { selectedId: selectedEntityId, hoveredId: hoveredEntityId, neighborIds: neighbors, pathNodeIds: pathNodeIdsRef };
      allNodesRef
        .attr("class", (item) => nodeStateClasses(item.id, context))
        .attr("aria-label", (item) => accessibility.nodeNames.get(item.id));
      allNodesRef.select("title").text((item) => accessibility.nodeNames.get(item.id));
      allNodesRef.select("circle.node-halo").attr("stroke", (item) => item.id === selectedEntityId ? "#8fc0ff" : "transparent");
      allNodesRef.select("text.node-label").attr("display", (item) => labelIdsRef.has(item.id) ? null : "none");
      allNodesRef.select("rect.node-label-backing").attr("display", (item) => labelIdsRef.has(item.id) ? null : "none");
      allNodesRef.select("g.node-evidence-badge").attr("display", (item) => badgeIds.has(item.id) ? null : "none");
    }
    if (allLinksRef) {
      const edgeLabelIds = graphEdgeLabelIds(nodesRef, activeLayoutLinks, {
        requested: requestedLabels,
        selectedId: selectedEntityId,
        hoveredNodeId: hoveredEntityId,
        selectedLinkId,
        hoveredLinkId,
        pathLinkIds: pathLinkIdsRef,
      });
      allLinksRef.attr("class", (item) => {
        const classes = ["graph-edge"];
        if (item.id === selectedLinkId) classes.push("is-selected");
        if (item.id === hoveredLinkId) classes.push("is-hovered");
        if (pathLinkIdsRef.has(item.id)) classes.push("is-path");
        if (item.contextual) classes.push("is-contextual");
        if ((selectedLinkId || hoveredLinkId) && item.id !== selectedLinkId && item.id !== hoveredLinkId && !pathLinkIdsRef.has(item.id)) classes.push("is-dimmed");
        return classes.join(" ");
      }).attr("aria-label", (item) => accessibility.relationshipNames.get(item.id));
      allLinksRef.select("title").text((item) => accessibility.relationshipNames.get(item.id));
      allLinksRef.select("text.edge-label").attr("display", (item) => edgeLabelIds.has(item.id) ? null : "none");
      allLinksRef.select("text.edge-citation").attr("display", (item) => edgeLabelIds.has(item.id) && (item.citations?.length ?? 0) > 0 ? null : "none");
    }
  }

  function configureLayout(layout, targets, selectedId, preserveFixedIds = new Set()) {
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    if (layout === "force") {
      simulation.force("x", d3.forceX(() => width / 2).strength(0.045));
      simulation.force("y", d3.forceY(() => height / 2).strength(0.045));
      applyLayoutFixations(nodesRef, { layout, selectedId, width, height, preserveFixedIds });
      return;
    }
    const strength = layout === "lanes" ? 0.82 : 0.9;
    simulation.force("x", d3.forceX((node) => targets.get(node.id)?.x ?? width / 2).strength(strength));
    simulation.force("y", d3.forceY((node) => targets.get(node.id)?.y ?? height / 2).strength(layout === "lanes" ? 0.12 : strength));
    for (const node of nodesRef) {
      const target = targets.get(node.id);
      if (!Number.isFinite(node.x) && target) { node.x = target.x; node.y = target.y; }
    }
    applyLayoutFixations(nodesRef, { layout, selectedId, width, height, preserveFixedIds });
  }

  function update(caseData, filters = {}) {
    width = svgEl.clientWidth || width;
    height = svgEl.clientHeight || height;
    const model = graphListModel(caseData, filters);
    pathNodeIdsRef = filters.pathNodeIds ? new Set(filters.pathNodeIds) : idsFromDataset(svgEl.dataset.graphPathNodes);
    pathLinkIdsRef = filters.pathLinkIds ? new Set(filters.pathLinkIds) : idsFromDataset(svgEl.dataset.graphPathLinks);
    requestedLabels = filters.labels ?? filters.graph_labels ?? "auto";
    if (Object.hasOwn(filters, "selectedId")) selectedEntityId = filters.selectedId;
    const nodes = model.nodes.map((node) => {
      const previous = positions.get(node.id) ?? {};
      const positioned = node.position ?? {};
      const next = reconcileGraphNode(previous, node, positioned);
      positions.set(node.id, next);
      return next;
    });
    const previousLayout = activeLayout;
    const requestedLayout = filters.layout ?? filters.graph_layout ?? "force";
    const requestedSelectedId = filters.selectedId ?? selectedEntityId;
    const layoutSelectedId = nodes.some((node) => node.id === requestedSelectedId) ? requestedSelectedId : null;
    const layout = requestedLayout === "radial" && !layoutSelectedId ? "force" : requestedLayout;
    const targets = layoutTargets(nodes, model.links, { layout, selectedId: layoutSelectedId, width, height });
    activeLayout = layout;
    activeLayoutLinks = model.links;
    activeLayoutSelectedId = layoutSelectedId;
    activeTargets = targets;
    nodesRef = nodes;
    linksRef = model.links.map((link) => ({ ...link, source: link.from, target: link.to }));
    configureLayout(layout, targets, layoutSelectedId, previousLayout === layout ? draggingNodeIds : new Set());

    const link = linkLayer.selectAll("g.graph-edge").data(linksRef, (item) => item.id);
    link.exit().remove();
    const linkEnter = link.enter().append("g").attr("class", "graph-edge").attr("tabindex", 0).attr("role", "button")
      .on("click", (event, item) => { event.stopPropagation(); selectedLinkId = item.id; applyPresentation(); onSelectLink(item.id); })
      .on("keydown", (event, item) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectedLinkId = item.id; applyPresentation(); onSelectLink(item.id); } })
      .on("pointerenter", (_, item) => { hoveredLinkId = item.id; renderHoverStatus("link", item); applyPresentation(); })
      .on("pointerleave", () => { hoveredLinkId = null; renderHoverStatus("link", null); applyPresentation(); })
      .on("focus", (_, item) => { hoveredLinkId = item.id; renderHoverStatus("link", item); applyPresentation(); })
      .on("blur", () => { hoveredLinkId = null; renderHoverStatus("link", null); applyPresentation(); });
    linkEnter.append("path").attr("class", "edge-hit");
    linkEnter.append("path").attr("class", "edge-line");
    linkEnter.append("text").attr("class", "edge-label").append("textPath").attr("startOffset", "50%").attr("text-anchor", "middle");
    linkEnter.append("text").attr("class", "edge-citation").attr("text-anchor", "middle");
    linkEnter.append("title");
    const allLinks = linkEnter.merge(link)
      .attr("data-graph-link-id", (item) => item.id)
      .attr("aria-label", (item) => relationshipAccessibleName(item, nodes, { inPath: pathLinkIdsRef.has(item.id) }));
    allLinksRef = allLinks;
    allLinks.select("path.edge-line")
      .attr("id", (item) => edgeDomId(item.id))
      .attr("stroke", (item) => EDGE_COLORS[item.status] ?? EDGE_COLORS.proposed)
      .attr("stroke-dasharray", (item) => edgePresentation(item).pattern)
      .attr("marker-end", (item) => edgePresentation(item).directional ? `url(#${edgePresentation(item).marker})` : null);
    allLinks.select("textPath")
      .attr("href", (item) => `#${edgeDomId(item.id)}`)
      .text((item) => relationshipTypeLabel(item.relationship_type));
    allLinks.select("text.edge-citation").text((item) => sourceCountLabel(item));
    allLinks.select("title").text((item) => relationshipAccessibleName(item, nodes, { inPath: pathLinkIdsRef.has(item.id) }));

    const node = nodeLayer.selectAll("g.graph-node").data(nodes, (item) => item.id);
    node.exit().remove();
    const enter = node.enter().append("g").attr("class", "graph-node").attr("tabindex", 0).attr("role", "button")
      .call(d3.drag()
        .on("start", (event, item) => { draggingNodeIds.add(item.id); if (!event.active && !reducedMotion) simulation.alphaTarget(0.3).restart(); item.fx = item.x; item.fy = item.y; })
        .on("drag", (event, item) => { applyNodeDrag(item, event, { reducedMotion, paint: paintNodes }); })
        .on("end", (event, item) => {
          if (!event.active) simulation.alphaTarget(0);
          const fixedPosition = activeLayout === "radial" && item.id === activeLayoutSelectedId ? { x: width / 2, y: height / 2 } : null;
          applyNodeDrag(item, event, { reducedMotion, paint: paintNodes, ending: true, fixedPosition, publish: publishPositions });
          draggingNodeIds.delete(item.id);
        }))
      .on("click", (event, item) => { event.stopPropagation(); selectedEntityId = item.id; labelIdsRef = graphLabelIds(nodesRef, activeLayoutLinks, { requested: requestedLabels, selectedId: selectedEntityId, pathNodeIds: pathNodeIdsRef }); applyPresentation(); onSelectEntity(item.id); })
      .on("keydown", (event, item) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectedEntityId = item.id; labelIdsRef = graphLabelIds(nodesRef, activeLayoutLinks, { requested: requestedLabels, selectedId: selectedEntityId, pathNodeIds: pathNodeIdsRef }); applyPresentation(); onSelectEntity(item.id); } })
      .on("pointerenter", (_, item) => { hoveredEntityId = item.id; renderHoverStatus("entity", item); applyPresentation(); })
      .on("pointerleave", () => { hoveredEntityId = null; renderHoverStatus("entity", null); applyPresentation(); })
      .on("focus", (_, item) => { hoveredEntityId = item.id; renderHoverStatus("entity", item); applyPresentation(); })
      .on("blur", () => { hoveredEntityId = null; renderHoverStatus("entity", null); applyPresentation(); });
    enter.append("circle").attr("class", "node-halo").attr("r", 23).attr("fill", "none");
    enter.append("circle").attr("class", "node-collection-ring").attr("r", 19).attr("fill", "none");
    enter.append("circle").attr("class", "node-provenance-ring").attr("r", 15).attr("fill", "none");
    enter.append("circle").attr("class", "node-type-disc").attr("r", 11);
    enter.append("path").attr("class", "node-glyph").attr("transform", "translate(-6,-6) scale(.5)");
    enter.append("rect").attr("class", "node-label-backing").attr("rx", 4).attr("y", 25).attr("height", 18);
    enter.append("text").attr("class", "node-label").attr("y", 38).attr("text-anchor", "middle");
    const evidenceBadge = enter.append("g").attr("class", "node-evidence-badge").attr("transform", "translate(16,-16)");
    evidenceBadge.append("circle").attr("r", 7);
    evidenceBadge.append("text").attr("dy", ".33em").attr("text-anchor", "middle");
    enter.append("title");
    const allNodes = enter.merge(node).attr("data-graph-entity-id", (item) => item.id);
    allNodesRef = allNodes;
    labelIdsRef = graphLabelIds(nodes, model.links, { requested: requestedLabels, selectedId: filters.selectedId ?? selectedEntityId, pathNodeIds: pathNodeIdsRef });
    allNodes.select("circle.node-type-disc").attr("fill", (item) => COLORS[item.type] ?? "#9aa7b7");
    allNodes.select("circle.node-collection-ring")
      .attr("stroke", (item) => collectionColor(item.metadata?.collectionStatus))
      .attr("stroke-dasharray", (item) => item.metadata?.collectionStatus === "indeterminate" ? "3 3" : null);
    allNodes.select("circle.node-provenance-ring")
      .attr("stroke", (item) => item.added_by === "agent" ? "#c19aff" : "#7f9bb7")
      .attr("stroke-dasharray", (item) => item.added_by === "agent" ? "3 2" : null);
    allNodes.select("path.node-glyph").attr("d", (item) => ENTITY_GLYPHS[item.type] ?? ENTITY_GLYPHS.document);
    allNodes.select("text.node-label").text((item) => item.value.length > 30 ? `${item.value.slice(0, 28)}…` : item.value);
    allNodes.select("rect.node-label-backing")
      .attr("width", nodeLabelWidth)
      .attr("x", (item) => -nodeLabelWidth(item) / 2);
    allNodes.select("g.node-evidence-badge text").text((item) => item.metadata?.evidenceCount ?? 0);
    allNodes.select("title").text((item) => nodeAccessibleName({ ...item, inPath: pathNodeIdsRef.has(item.id) }));
    applyPresentation();

    const paint = () => {
      allLinks.selectAll("path.edge-hit, path.edge-line").attr("d", edgePath);
      allLinks.select("text.edge-citation")
        .attr("x", (item) => edgeMidpoint(item).x)
        .attr("y", (item) => edgeMidpoint(item).y + 14);
      allNodes.attr("transform", (item) => `translate(${finite(item.x)},${finite(item.y)})`);
      paintMinimap();
    };
    paintNodes = paint;
    simulation.nodes(nodes).on("tick", paint);
    simulation.force("link").links(linksRef);
    if (reducedMotion) settleImmediately(simulation, paint);
    else simulation.alpha(layout === "force" ? 0.55 : 0.75).restart();
  }

  function fit(selectedId = null) {
    const targetNodes = nodesForFit(nodesRef, selectedId, activeLayoutLinks);
    if (!targetNodes.length) return;
    const xs = targetNodes.map((node) => node.x ?? 0);
    const ys = targetNodes.map((node) => node.y ?? 0);
    const minX = Math.min(...xs) - 55;
    const maxX = Math.max(...xs) + 55;
    const minY = Math.min(...ys) - 55;
    const maxY = Math.max(...ys) + 55;
    const scale = Math.min(1.5, 0.88 / Math.max((maxX - minX) / width, (maxY - minY) / height));
    const transform = d3.zoomIdentity.translate(width / 2 - scale * (minX + maxX) / 2, height / 2 - scale * (minY + maxY) / 2).scale(scale);
    if (reducedMotion) svg.call(zoomBehaviour.transform, transform);
    else svg.transition().duration(260).call(zoomBehaviour.transform, transform);
  }

  function fitSelection(selectedId = selectedEntityId) {
    fit(selectedId);
  }

  function zoom(factor) {
    if (reducedMotion) svg.call(zoomBehaviour.scaleBy, factor);
    else svg.transition().duration(150).call(zoomBehaviour.scaleBy, factor);
  }

  function resetLayout() {
    positions.clear();
    resetGraphLayoutNodes(nodesRef, activeLayoutLinks, { layout: activeLayout, selectedId: activeLayoutSelectedId, width, height });
    if (activeLayout === "lanes") for (const node of nodesRef) { node.fx = null; node.fy = null; }
    if (activeLayout === "radial") for (const node of nodesRef) if (node.id !== activeLayoutSelectedId) { node.fx = null; node.fy = null; }
    configureLayout(activeLayout, activeTargets, activeLayoutSelectedId);
    onPositionsChange({}, { replace: true });
    if (reducedMotion) settleImmediately(simulation, paintNodes);
    else simulation.alpha(1).restart();
  }

  function selectEntity(id) {
    selectedEntityId = id;
    applyPresentation();
  }

  function selectLink(id) {
    selectedLinkId = id;
    applyPresentation();
  }

  function clearHover() {
    hoveredEntityId = null;
    hoveredLinkId = null;
    renderHoverStatus("entity", null);
    onHoverLink(null);
    applyPresentation();
  }

  function updateInteraction({ selectedId = selectedEntityId, pathNodeIds = pathNodeIdsRef, pathLinkIds = pathLinkIdsRef } = {}) {
    selectedEntityId = selectedId;
    pathNodeIdsRef = pathNodeIds instanceof Set ? new Set(pathNodeIds) : new Set(pathNodeIds ?? []);
    pathLinkIdsRef = pathLinkIds instanceof Set ? new Set(pathLinkIds) : new Set(pathLinkIds ?? []);
    applyPresentation();
  }

  function focusEntity(id) {
    return restoreGraphFocus(svgEl, { kind: "entity", id });
  }

  function focusLink(id) {
    return restoreGraphFocus(svgEl, { kind: "link", id });
  }

  function resize() {
    const nextWidth = svgEl.clientWidth || width;
    const nextHeight = svgEl.clientHeight || height;
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth;
    height = nextHeight;
    activeTargets = layoutTargets(nodesRef, activeLayoutLinks, { layout: activeLayout, selectedId: activeLayoutSelectedId, width, height });
    configureLayout(activeLayout, activeTargets, activeLayoutSelectedId);
    if (reducedMotion) settleImmediately(simulation, paintNodes);
    else simulation.alpha(0.35).restart();
    paintMinimap();
    return true;
  }

  const ResizeObserverClass = svgEl.ownerDocument?.defaultView?.ResizeObserver ?? globalThis.ResizeObserver;
  const resizeObserver = typeof ResizeObserverClass === "function" ? new ResizeObserverClass(resize) : null;
  resizeObserver?.observe(svgEl);

  svg.on("keydown.graph-hover", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      clearHover();
    }
  });

  function destroy() {
    positionPublisher.flush();
    resizeObserver?.disconnect();
    simulation.stop();
    svg.on(".zoom", null).on(".graph-hover", null);
    minimap?.on("click", null).on(".drag", null);
    svg.selectAll("*").remove();
    minimap?.selectAll("*").remove();
  }

  return { update, updateInteraction, fit, fitSelection, zoom, resetLayout, resize, flushPositions: positionPublisher.flush, focusEntity, focusLink, destroy, select: selectEntity, selectEntity, selectLink, colors: COLORS };
}
