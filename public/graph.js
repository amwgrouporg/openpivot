// Force graph of the board. Uses the global d3 loaded from the CDN.
const COLORS = { domain: "#3b82f6", ip: "#f59e0b", url: "#10b981", org: "#a855f7", document: "#64748b", claim: "#ef4444" };

export function createGraph(svgEl, { onSelect }) {
  if (typeof d3 === "undefined") {
    // The board must keep working, and tools must register, without the graph library.
    return { update() {}, select() {}, colors: COLORS, unavailable: true };
  }
  const svg = d3.select(svgEl);
  const g = svg.append("g");
  const linkLayer = g.append("g").attr("class", "links");
  const nodeLayer = g.append("g").attr("class", "nodes");
  svg.call(d3.zoom().scaleExtent([0.3, 3]).on("zoom", (ev) => g.attr("transform", ev.transform)));

  let width = svgEl.clientWidth || 600;
  let height = svgEl.clientHeight || 400;
  const sim = d3.forceSimulation()
    .force("link", d3.forceLink().id((d) => d.id).distance(110))
    .force("charge", d3.forceManyBody().strength(-320))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(28));

  const positions = new Map();
  let selectedId = null;

  function update(caseData) {
    width = svgEl.clientWidth || width;
    height = svgEl.clientHeight || height;
    sim.force("center", d3.forceCenter(width / 2, height / 2));

    const nodes = caseData.entities.map((e) => Object.assign(positions.get(e.id) ?? {}, { id: e.id, type: e.type, value: e.value, added_by: e.added_by }));
    nodes.forEach((n) => positions.set(n.id, n));
    const ids = new Set(nodes.map((n) => n.id));
    const links = caseData.links.filter((l) => l.status !== "rejected" && ids.has(l.from) && ids.has(l.to)).map((l) => ({ id: l.id, source: l.from, target: l.to, status: l.status, rationale: l.rationale }));

    const link = linkLayer.selectAll("line").data(links, (d) => d.id);
    link.exit().remove();
    const linkEnter = link.enter().append("line");
    linkEnter.append("title");
    linkEnter.merge(link)
      .attr("stroke", (d) => (d.status === "accepted" ? "#94a3b8" : "#cbd5e1"))
      .attr("stroke-width", (d) => (d.status === "accepted" ? 2 : 1.5))
      .attr("stroke-dasharray", (d) => (d.status === "proposed" ? "5,4" : null))
      .select("title").text((d) => `${d.status}: ${d.rationale}`);

    const node = nodeLayer.selectAll("g.node").data(nodes, (d) => d.id);
    node.exit().remove();
    const enter = node.enter().append("g").attr("class", "node").style("cursor", "pointer")
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on("click", (ev, d) => { selectedId = d.id; onSelect?.(d.id); update(caseData); });
    enter.append("circle").attr("r", 14);
    enter.append("text").attr("dy", 28).attr("text-anchor", "middle");
    enter.append("title");
    const all = enter.merge(node);
    all.select("circle")
      .attr("fill", (d) => COLORS[d.type] ?? "#999")
      .attr("stroke", (d) => (d.id === selectedId ? "#111827" : d.added_by === "agent" ? "#fff" : "#111827"))
      .attr("stroke-width", (d) => (d.id === selectedId ? 4 : 2))
      .attr("stroke-dasharray", (d) => (d.added_by === "agent" ? "3,2" : null));
    all.select("text").text((d) => (d.value.length > 28 ? `${d.value.slice(0, 26)}..` : d.value));
    all.select("title").text((d) => `${d.type}: ${d.value} (added by ${d.added_by})`);

    sim.nodes(nodes).on("tick", () => {
      linkLayer.selectAll("line").attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      all.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
    sim.force("link").links(links);
    sim.alpha(0.6).restart();
  }

  return { update, select: (id) => { selectedId = id; }, colors: COLORS };
}
