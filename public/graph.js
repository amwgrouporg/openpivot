// D3 graph with a pure model boundary. The pure model keeps filtering and persisted
// positions testable even when D3 is unavailable.
const COLORS = { domain: "#6ea8fe", ip: "#f2bd4a", url: "#59d48b", org: "#bd91ff", document: "#9aa7b7", claim: "#ff7b72" };
import { relationshipStatusLabel, relationshipTypeLabel } from "./ui/copy.js";
import { filterGraph } from "./graph-model.js";

export function mergeGraphPositions(current, visible, { replace = false } = {}) {
  return replace ? { ...visible } : { ...(current ?? {}), ...(visible ?? {}) };
}

export function settleImmediately(simulation, paint) {
  simulation.alpha(1).tick(80).stop();
  paint();
}

export function graphListModel(caseData, filters = {}) {
  const selectedId = filters.selectedId ?? filters.connectedTo;
  const hops = filters.hops ?? (filters.connectedTo ? 1 : "all");
  return filterGraph(caseData, { ...filters, selectedId, hops });
}

export function createGraph(svgEl, options = {}) {
  const onSelectEntity = options.onSelectEntity ?? options.onSelect ?? (() => {});
  const onSelectLink = options.onSelectLink ?? (() => {});
  const onPositionsChange = options.onPositionsChange ?? (() => {});
  const reducedMotion = options.reducedMotion ?? false;
  if (typeof d3 === "undefined" || !svgEl) {
    return { update() {}, select() {}, selectEntity() {}, selectLink() {}, fit() {}, zoom() {}, resetLayout() {}, destroy() {}, colors: COLORS, unavailable: true };
  }

  const svg = d3.select(svgEl);
  const root = svg.append("g");
  const linkLayer = root.append("g").attr("class", "links");
  const nodeLayer = root.append("g").attr("class", "nodes");
  const zoomBehaviour = d3.zoom().scaleExtent([0.25, 4]).on("zoom", (event) => root.attr("transform", event.transform));
  svg.call(zoomBehaviour).on("dblclick.zoom", null);

  let width = svgEl.clientWidth || 600;
  let height = svgEl.clientHeight || 400;
  let selectedEntityId = null;
  let selectedLinkId = null;
  let nodesRef = [];
  let positionTimer = null;
  const positions = new Map();
  const simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id((node) => node.id).distance(105).strength(0.62))
    .force("charge", d3.forceManyBody().strength(-290))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(() => width / 2).strength(0.045))
    .force("y", d3.forceY(() => height / 2).strength(0.045))
    .force("collide", d3.forceCollide(30));

  function publishPositions() {
    clearTimeout(positionTimer);
    positionTimer = setTimeout(() => {
      const saved = {};
      for (const node of nodesRef) if (Number.isFinite(node.x) && Number.isFinite(node.y)) saved[node.id] = { x: Math.round(node.x), y: Math.round(node.y) };
      onPositionsChange(saved, { replace: false });
    }, 180);
  }

  function update(caseData, filters = {}) {
    width = svgEl.clientWidth || width;
    height = svgEl.clientHeight || height;
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    simulation.force("x").x(width / 2);
    simulation.force("y").y(height / 2);
    const model = graphListModel(caseData, filters);
    const nodes = model.nodes.map((node) => {
      const previous = positions.get(node.id) ?? {};
      const positioned = node.position ?? {};
      const next = Object.assign(previous, node, positioned);
      positions.set(node.id, next);
      return next;
    });
    nodesRef = nodes;
    const links = model.links.map((link) => ({ ...link, source: link.from, target: link.to }));

    const link = linkLayer.selectAll("line.graph-link").data(links, (item) => item.id);
    link.exit().remove();
    const linkEnter = link.enter().append("line").attr("class", "graph-link").attr("tabindex", 0).attr("role", "button")
      .on("click", (event, item) => { event.stopPropagation(); selectedLinkId = item.id; onSelectLink(item.id); })
      .on("keydown", (event, item) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectedLinkId = item.id; onSelectLink(item.id); } });
    linkEnter.append("title");
    const allLinks = linkEnter.merge(link)
      .attr("aria-label", (item) => `${relationshipStatusLabel(item.status)}; ${relationshipTypeLabel(item.relationship_type)}; ${item.rationale}`)
      .attr("stroke", (item) => item.status === "accepted" ? "#597897" : "#c69843")
      .attr("stroke-width", (item) => item.id === selectedLinkId ? 3 : item.status === "accepted" ? 1.8 : 1.6)
      .attr("stroke-dasharray", (item) => item.status === "proposed" ? "6,5" : null);
    allLinks.select("title").text((item) => `${relationshipStatusLabel(item.status)} · ${relationshipTypeLabel(item.relationship_type)}: ${item.rationale}`);

    const node = nodeLayer.selectAll("g.graph-node").data(nodes, (item) => item.id);
    node.exit().remove();
    const enter = node.enter().append("g").attr("class", "graph-node").attr("tabindex", 0).attr("role", "button").style("cursor", "pointer")
      .call(d3.drag()
        .on("start", (event, item) => { if (!event.active) simulation.alphaTarget(0.3).restart(); item.fx = item.x; item.fy = item.y; })
        .on("drag", (event, item) => { item.fx = event.x; item.fy = event.y; })
        .on("end", (event, item) => { if (!event.active) simulation.alphaTarget(0); item.x = event.x; item.y = event.y; item.fx = null; item.fy = null; publishPositions(); }))
      .on("click", (event, item) => { event.stopPropagation(); selectedEntityId = item.id; onSelectEntity(item.id); })
      .on("keydown", (event, item) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectedEntityId = item.id; onSelectEntity(item.id); } });
    enter.append("circle").attr("class", "node-halo").attr("r", 15).attr("fill", "none");
    enter.append("circle").attr("class", "node-ring").attr("r", 11).attr("fill", "#0b1624");
    enter.append("circle").attr("class", "node-dot").attr("r", 6.5);
    enter.append("text").attr("dy", 25).attr("text-anchor", "middle");
    enter.append("title");
    const allNodes = enter.merge(node).attr("aria-label", (item) => `${item.type}: ${item.value}, added by ${item.added_by}`);
    allNodes.select("circle.node-dot").attr("fill", (item) => COLORS[item.type] ?? "#9aa7b7");
    allNodes.select("circle.node-ring").attr("stroke", (item) => item.added_by === "agent" ? "#c19aff" : "#587392").attr("stroke-width", 1.2).attr("stroke-dasharray", (item) => item.added_by === "agent" ? "3,2" : null);
    allNodes.select("circle.node-halo").attr("stroke", (item) => item.id === selectedEntityId ? "#69a9ff" : "transparent").attr("stroke-width", 2);
    allNodes.select("text").text((item) => item.value.length > 30 ? `${item.value.slice(0, 28)}…` : item.value);
    allNodes.select("title").text((item) => `${item.type}: ${item.value} (added by ${item.added_by})`);

    const paint = () => {
      allLinks.attr("x1", (item) => item.source.x).attr("y1", (item) => item.source.y).attr("x2", (item) => item.target.x).attr("y2", (item) => item.target.y);
      allNodes.attr("transform", (item) => `translate(${item.x},${item.y})`);
    };
    simulation.nodes(nodes).on("tick", paint);
    simulation.force("link").links(links);
    if (reducedMotion) {
      settleImmediately(simulation, paint);
    } else simulation.alpha(0.55).restart();
  }

  function fit() {
    if (!nodesRef.length) return;
    const xs = nodesRef.map((node) => node.x ?? 0);
    const ys = nodesRef.map((node) => node.y ?? 0);
    const minX = Math.min(...xs) - 55, maxX = Math.max(...xs) + 55, minY = Math.min(...ys) - 55, maxY = Math.max(...ys) + 55;
    const scale = Math.min(1.5, 0.88 / Math.max((maxX - minX) / width, (maxY - minY) / height));
    const transform = d3.zoomIdentity.translate(width / 2 - scale * (minX + maxX) / 2, height / 2 - scale * (minY + maxY) / 2).scale(scale);
    if (reducedMotion) svg.call(zoomBehaviour.transform, transform);
    else svg.transition().duration(260).call(zoomBehaviour.transform, transform);
  }

  function zoom(factor) {
    if (reducedMotion) svg.call(zoomBehaviour.scaleBy, factor);
    else svg.transition().duration(150).call(zoomBehaviour.scaleBy, factor);
  }

  function resetLayout() {
    positions.clear();
    for (const node of nodesRef) { node.fx = null; node.fy = null; delete node.x; delete node.y; }
    onPositionsChange({}, { replace: true });
    if (reducedMotion) {
      settleImmediately(simulation, () => {
        linkLayer.selectAll("line.graph-link").attr("x1", (item) => item.source.x).attr("y1", (item) => item.source.y).attr("x2", (item) => item.target.x).attr("y2", (item) => item.target.y);
        nodeLayer.selectAll("g.graph-node").attr("transform", (item) => `translate(${item.x},${item.y})`);
      });
    } else simulation.alpha(1).restart();
  }

  function selectEntity(id) {
    selectedEntityId = id;
    nodeLayer.selectAll("circle.node-halo").attr("stroke", (item) => item.id === selectedEntityId ? "#69a9ff" : "transparent");
  }

  function selectLink(id) {
    selectedLinkId = id;
    linkLayer.selectAll("line.graph-link").attr("stroke-width", (item) => item.id === selectedLinkId ? 3 : item.status === "accepted" ? 1.8 : 1.6);
  }

  function destroy() {
    clearTimeout(positionTimer);
    simulation.stop();
    svg.on(".zoom", null);
    svg.selectAll("*").remove();
  }

  return { update, fit, zoom, resetLayout, destroy, select: selectEntity, selectEntity, selectLink, colors: COLORS };
}
