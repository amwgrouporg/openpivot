// Force graph of the board. Uses the global d3 loaded from /vendor. Degrades to a no-op
// when the library is missing so tools still register.
const COLORS = { domain: "#6ea8fe", ip: "#e3b341", url: "#56d364", org: "#c297ff", document: "#8b949e", claim: "#ff7b72" };

export function createGraph(svgEl, { onSelect }) {
  if (typeof d3 === "undefined") {
    return { update() {}, select() {}, fit() {}, zoom() {}, colors: COLORS, unavailable: true };
  }
  const svg = d3.select(svgEl);
  const g = svg.append("g");
  const linkLayer = g.append("g").attr("class", "links");
  const nodeLayer = g.append("g").attr("class", "nodes");
  const zoomBehaviour = d3.zoom().scaleExtent([0.25, 4]).on("zoom", (ev) => g.attr("transform", ev.transform));
  svg.call(zoomBehaviour).on("dblclick.zoom", null);

  let width = svgEl.clientWidth || 600;
  let height = svgEl.clientHeight || 400;
  const sim = d3.forceSimulation()
    .force("link", d3.forceLink().id((d) => d.id).distance(90).strength(0.6))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(24));

  const positions = new Map();
  let selectedId = null;
  let nodesRef = [];

  function update(caseData) {
    width = svgEl.clientWidth || width;
    height = svgEl.clientHeight || height;
    sim.force("center", d3.forceCenter(width / 2, height / 2));

    const nodes = caseData.entities.map((e) => Object.assign(positions.get(e.id) ?? {}, { id: e.id, type: e.type, value: e.value, added_by: e.added_by }));
    nodes.forEach((n) => positions.set(n.id, n));
    nodesRef = nodes;
    const ids = new Set(nodes.map((n) => n.id));
    const links = caseData.links.filter((l) => l.status !== "rejected" && ids.has(l.from) && ids.has(l.to)).map((l) => ({ id: l.id, source: l.from, target: l.to, status: l.status, rationale: l.rationale }));

    const link = linkLayer.selectAll("line").data(links, (d) => d.id);
    link.exit().remove();
    const linkEnter = link.enter().append("line");
    linkEnter.append("title");
    linkEnter.merge(link)
      .attr("stroke", (d) => (d.status === "accepted" ? "#4b5563" : "#3a424c"))
      .attr("stroke-width", (d) => (d.status === "accepted" ? 1.4 : 1.2))
      .attr("stroke-dasharray", (d) => (d.status === "proposed" ? "4,3" : null))
      .select("title").text((d) => `${d.status}: ${d.rationale}`);

    const node = nodeLayer.selectAll("g.node").data(nodes, (d) => d.id);
    node.exit().remove();
    const enter = node.enter().append("g").attr("class", "node").style("cursor", "pointer")
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on("click", (ev, d) => { ev.stopPropagation(); selectedId = d.id; onSelect?.(d.id); });
    enter.append("circle").attr("class", "ring").attr("r", 11).attr("fill", "none");
    enter.append("circle").attr("class", "dot").attr("r", 6.5);
    enter.append("text").attr("dy", 22).attr("text-anchor", "middle");
    enter.append("title");
    const all = enter.merge(node);
    all.select("circle.dot")
      .attr("fill", (d) => COLORS[d.type] ?? "#8b949e")
      .attr("stroke", "#0c0e11")
      .attr("stroke-width", 1.5);
    all.select("circle.ring")
      .attr("stroke", (d) => (d.id === selectedId ? "#5b9bff" : d.added_by === "agent" ? "#6b7280" : "none"))
      .attr("stroke-width", (d) => (d.id === selectedId ? 1.5 : 1))
      .attr("stroke-dasharray", (d) => (d.id === selectedId ? null : "2,2"));
    all.select("text").text((d) => (d.value.length > 30 ? `${d.value.slice(0, 28)}..` : d.value));
    all.select("title").text((d) => `${d.type}: ${d.value} (added by ${d.added_by})`);

    sim.nodes(nodes).on("tick", () => {
      linkLayer.selectAll("line").attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      all.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
    sim.force("link").links(links);
    sim.alpha(0.5).restart();
  }

  function fit() {
    if (!nodesRef.length) return;
    const xs = nodesRef.map((n) => n.x ?? 0);
    const ys = nodesRef.map((n) => n.y ?? 0);
    const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + 40, minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 40;
    const scale = Math.min(1.4, 0.92 / Math.max((maxX - minX) / width, (maxY - minY) / height));
    const tx = width / 2 - scale * (minX + maxX) / 2;
    const ty = height / 2 - scale * (minY + maxY) / 2;
    svg.transition().duration(300).call(zoomBehaviour.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function zoom(factor) {
    svg.transition().duration(150).call(zoomBehaviour.scaleBy, factor);
  }

  return { update, fit, zoom, select: (id) => { selectedId = id; }, colors: COLORS };
}
