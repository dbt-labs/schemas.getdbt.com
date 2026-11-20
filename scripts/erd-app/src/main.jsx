import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BaseEdge,
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";

import {
  DEFAULT_STATE,
  HEADER_HEIGHT,
  KINDS,
  ROW_HEIGHT,
  TABLE_WIDTH,
  buildView,
  elkGraph,
  fromHash,
  neighbours,
  scoped,
  search,
  toHash,
  visibleColumns,
  visibleLinks,
} from "./graph.js";
import "./styles.css";

const elk = new ELK();
const h = React.createElement;

const root = document.getElementById("root");
const cfg = { ...root.dataset };

function TableNode({ data }) {
  const { table, columns, dim, selected } = data;
  const cols = visibleColumns(table, columns);
  return h(
    "div",
    { className: `table-node${selected ? " selected" : ""}${dim ? " dim" : ""}`, style: { width: TABLE_WIDTH } },
    h(Handle, { type: "target", position: Position.Left, isConnectable: false }),
    h(Handle, { type: "source", position: Position.Right, isConnectable: false }),
    h("div", { className: "table-head", style: { height: HEADER_HEIGHT } }, table.id),
    cols.length === 0
      ? h("div", { className: "col muted", style: { height: ROW_HEIGHT } }, "no key columns")
      : cols.map((c) =>
          h(
            "div",
            { className: "col", key: c.name, style: { height: ROW_HEIGHT } },
            h("span", { className: "col-name" }, c.name),
            h("span", { className: "col-badges" }, c.pk ? "PK" : "", c.pk && c.fk ? " " : "", c.fk ? "FK" : ""),
          ),
        ),
  );
}

function DomainNode({ data }) {
  const { name, count, open, dim, solo, onSolo } = data;
  const head = [
    h("span", { className: "caret", key: "c" }, open ? "\u25BE" : "\u25B8"),
    h("strong", { key: "n" }, name),
    h("span", { className: "muted", key: "m" }, `${count} table${count === 1 ? "" : "s"}`),
  ];
  return h(
    "div",
    { className: `domain-node${open ? " open" : ""}${dim ? " dim" : ""}` },
    h(Handle, { type: "target", position: Position.Left, isConnectable: false }),
    h(Handle, { type: "source", position: Position.Right, isConnectable: false }),
    open
      ? h(
          "div",
          { className: "domain-bar" },
          h("div", { className: "domain-head", title: "Click to collapse, drag to move" }, head),
          h(
            "button",
            { className: "solo nodrag", onClick: onSolo, title: solo ? "Show every group" : "Show only this group" },
            solo ? "Show all groups" : "Only this group",
          ),
        )
      : h("div", { className: "domain-head", title: "Click to expand, drag to move" }, head),
  );
}

/** An edge. The selected one carries a card above the tables; others a short tag. */
function LinkEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }) {
  const [path, x, y] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { card, tag, links } = data;
  return h(
    React.Fragment,
    null,
    h(BaseEdge, { path, markerEnd, interactionWidth: 24 }),
    (card || tag) &&
      h(
        EdgeLabelRenderer,
        null,
        h(
          "div",
          {
            className: `edge-label nodrag nopan${card ? " card" : ""}`,
            style: {
              transform: `translate(-50%, ${card ? "-100%" : "-50%"}) translate(${x}px, ${card ? y - 16 : y}px)`,
              zIndex: card ? 1000 : 5,
            },
          },
          card
            ? links.map((l, i) =>
                h(
                  "div",
                  { key: i, className: "edge-line" },
                  h("code", null, `${l.from}.${l.column}`),
                  " \u2192 ",
                  h("code", null, l.to),
                  KINDS[l.kind].dashed ? h("span", { className: "muted" }, ` (${KINDS[l.kind].label.toLowerCase()})`) : null,
                ),
              )
            : tag,
        ),
      ),
  );
}

const nodeTypes = { table: TableNode, domain: DomainNode };
const edgeTypes = { link: LinkEdge };

function Explorer({ graph: fullGraph }) {
  const flow = useReactFlow();
  const [state, setState] = useState(() => fromHash(window.location.hash, fullGraph));
  const [laid, setLaid] = useState(null);
  // Where the user dragged tables and groups to, by node id. A new layout resets it.
  const [moved, setMoved] = useState(() => new Map());
  const [edgeKey, setEdgeKey] = useState(null);
  const graph = useMemo(() => scoped(fullGraph, state.only), [fullGraph, state.only]);
  const [query, setQuery] = useState("");
  const wrap = useRef(null);
  const pendingFit = useRef(null);

  const view = useMemo(() => buildView(graph, state), [graph, state.open, state.hidden]);
  const byId = useMemo(() => new Map(fullGraph.tables.map((t) => [t.id, t])), [fullGraph]);

  // Keep the URL in step with the view.
  useEffect(() => {
    const hash = toHash(state);
    window.history.replaceState(null, "", hash ? `#${hash}` : window.location.pathname + window.location.search);
  }, [state]);

  // Lay out whenever the shape of the view changes.
  useEffect(() => {
    let live = true;
    elk.layout(elkGraph(graph, state, view)).then((result) => {
      if (live) {
        setMoved(new Map());
        setLaid(result);
      }
    });
    return () => {
      live = false;
    };
  }, [graph, view, state.columns]);

  const onNodesChange = useCallback((changes) => {
    const drags = changes.filter((c) => c.type === "position" && c.position);
    if (drags.length === 0) return;
    setMoved((m) => {
      const next = new Map(m);
      for (const c of drags) next.set(c.id, c.position);
      return next;
    });
  }, []);

  const setOpen = useCallback((name, on) => {
    setState((s) => {
      const open = new Set(s.open);
      on ? open.add(name) : open.delete(name);
      return { ...s, open: [...open] };
    });
    pendingFit.current = "all";
  }, []);

  const select = useCallback(
    (id) => {
      const t = byId.get(id);
      setState((s) => {
        const open = new Set(s.open);
        if (t) open.add(t.domain);
        // A table outside the one group on show ends that.
        const only = s.only && t && t.domain !== s.only ? null : s.only;
        return { ...s, selected: id, open: [...open], only };
      });
      setEdgeKey(null);
      pendingFit.current = id;
    },
    [byId],
  );

  const solo = useCallback((name) => {
    setState((s) => (s.only ? { ...s, only: null } : { ...s, only: name, open: [name], selected: null }));
    setEdgeKey(null);
    pendingFit.current = "all";
  }, []);

  const focus = state.selected ? neighbours(graph, state, state.selected) : null;
  const focusDomains = focus ? new Set([...focus].map((id) => byId.get(id)?.domain)) : null;

  const { nodes, edges } = useMemo(() => {
    if (!laid) return { nodes: [], edges: [] };
    const nodes = [];
    for (const d of laid.children) {
      const name = d.id.replace(/^domain:/, "");
      const open = view.open.has(name);
      nodes.push({
        id: d.id,
        type: "domain",
        position: moved.get(d.id) ?? { x: d.x, y: d.y },
        style: { width: d.width, height: d.height },
        data: {
          name,
          open,
          count: (view.tablesOf.get(name) ?? []).length,
          dim: focusDomains && !focusDomains.has(name),
          solo: state.only === name,
          onSolo: () => solo(name),
        },
        draggable: true,
        selectable: false,
      });
      for (const c of d.children ?? []) {
        nodes.push({
          id: c.id,
          type: "table",
          parentId: d.id,
          // Tables move inside their group box.
          extent: "parent",
          position: moved.get(c.id) ?? { x: c.x, y: c.y },
          data: {
            table: byId.get(c.id),
            columns: state.columns,
            dim: focus && !focus.has(c.id),
            selected: state.selected === c.id,
          },
          draggable: true,
        });
      }
    }
    const edges = view.edges.map((e) => {
      const key = `${e.source}>${e.target}`;
      const chosen = edgeKey === key;
      const touches = state.selected && (e.source === state.selected || e.target === state.selected);
      const dim = (state.selected && !touches) || (edgeKey && !chosen);
      const columns = e.links.map((l) => l.column).filter((v, i, a) => a.indexOf(v) === i);
      // A merged edge between collapsed domains shows how many links it holds.
      const aggregated = e.source.startsWith("domain:") || e.target.startsWith("domain:");
      const tag = chosen ? null : touches ? columns.join(", ") : aggregated ? `${e.links.length}` : null;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        data: { links: e.links, card: chosen, tag },
        className: `${e.dashed ? "dashed" : ""}${dim ? " dim" : ""}${touches || chosen ? " active" : ""}`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        type: "link",
        zIndex: chosen ? 900 : 0,
      };
    });
    return { nodes, edges };
  }, [laid, moved, view, state.columns, state.selected, state.only, edgeKey, byId]);

  // Fit after a layout that followed a user action.
  useEffect(() => {
    if (!laid || !pendingFit.current) return;
    const target = pendingFit.current;
    pendingFit.current = null;
    const id = setTimeout(() => {
      if (target === "all") flow.fitView({ padding: 0.15, duration: 300 });
      else {
        // Leave room for the side panel on the right.
        flow.fitView({
          nodes: [{ id: target }],
          padding: { top: "120px", bottom: "120px", left: "120px", right: "460px" },
          maxZoom: 1.2,
          duration: 400,
        });
      }
    }, 50);
    return () => clearTimeout(id);
  }, [laid]);

  const toggleKind = (kind) =>
    setState((s) => {
      const hidden = new Set(s.hidden);
      hidden.has(kind) ? hidden.delete(kind) : hidden.add(kind);
      return { ...s, hidden: [...hidden] };
    });

  const hits = search(fullGraph, query);
  const selectedTable = state.selected ? byId.get(state.selected) : null;
  const allOpen = state.open.length === graph.domains.length;

  const fullscreen = () => {
    const el = wrap.current;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el && el.requestFullscreen) el.requestFullscreen();
  };

  return h(
    "div",
    { className: "explorer", ref: wrap },
    h(
      "div",
      { className: "toolbar" },
      h(
        "div",
        { className: "search" },
        h("input", {
          type: "search",
          placeholder: "Find a table or column",
          value: query,
          "aria-label": "Find a table or column",
          onChange: (e) => setQuery(e.target.value),
        }),
        hits.length > 0 &&
          h(
            "ul",
            { className: "hits" },
            hits.map((hit) =>
              h(
                "li",
                { key: hit.table },
                h(
                  "button",
                  {
                    onClick: () => {
                      select(hit.table);
                      setQuery("");
                    },
                  },
                  hit.table,
                  hit.column ? h("span", { className: "muted" }, ` .${hit.column}`) : null,
                ),
              ),
            ),
          ),
      ),
      h(
        "select",
        {
          value: state.only ?? "",
          "aria-label": "Group to show",
          onChange: (e) => {
            const only = e.target.value || null;
            setState((s) => ({ ...s, only, selected: null, open: only ? [only] : s.open }));
            setEdgeKey(null);
            pendingFit.current = "all";
          },
        },
        h("option", { value: "" }, "All groups"),
        fullGraph.domains.map((d) => h("option", { key: d.name, value: d.name }, `Only ${d.name}`)),
      ),
      h(
        "button",
        {
          onClick: () => {
            setState((s) => ({ ...s, open: allOpen ? [] : graph.domains.map((d) => d.name) }));
            pendingFit.current = "all";
          },
        },
        allOpen ? "Collapse all" : "Expand all",
      ),
      h(
        "button",
        {
          onClick: () => setState((s) => ({ ...s, columns: s.columns === "keys" ? "all" : "keys" })),
          title: "Switch between key columns and all columns",
        },
        state.columns === "keys" ? "Show all columns" : "Show key columns",
      ),
      h(
        "div",
        { className: "filters", role: "group", "aria-label": "Relationships to show" },
        Object.entries(KINDS).map(([kind, info]) =>
          h(
            "label",
            { key: kind, className: info.dashed ? "dashed-key" : "solid-key" },
            h("input", { type: "checkbox", checked: !state.hidden.includes(kind), onChange: () => toggleKind(kind) }),
            info.label,
          ),
        ),
        h(
          "label",
          { title: "A table whose key is also a link, such as models to dag_nodes" },
          h("input", { type: "checkbox", checked: !state.hidden.includes("subtype"), onChange: () => toggleKind("subtype") }),
          "Subtype links",
        ),
      ),
      h("span", { className: "spacer" }),
      cfg.graph && h("a", { className: "btn", href: cfg.graph, download: true }, "Download JSON"),
      h("button", { onClick: fullscreen }, "Fullscreen"),
    ),
    h(
      "div",
      { className: "stage" },
      h(
        ReactFlow,
        {
          nodes,
          edges,
          nodeTypes,
          edgeTypes,
          onNodesChange,
          minZoom: 0.1,
          maxZoom: 2,
          fitView: true,
          fitViewOptions: { padding: 0.15 },
          nodesConnectable: false,
          onNodeClick: (event, node) => {
            if (node.type === "table") select(node.id);
            if (node.type === "domain") {
              // A click on the header (or the whole box, when collapsed) opens or closes it.
              const t = event.target;
              if (t.closest(".solo")) return;
              const name = node.id.replace(/^domain:/, "");
              const open = view.open.has(name);
              if (!open || t.closest(".domain-bar")) setOpen(name, !open);
            }
          },
          onEdgeClick: (_, edge) => {
            setState((s) => ({ ...s, selected: null }));
            setEdgeKey(`${edge.source}>${edge.target}`);
          },
          onPaneClick: () => {
            setState((s) => ({ ...s, selected: null }));
            setEdgeKey(null);
          },
          proOptions: { hideAttribution: false },
        },
        h(Background, { gap: 24, color: "#0f5566" }),
        h(Controls, { showInteractive: false }),
        h(MiniMap, { pannable: true, zoomable: true, nodeColor: (n) => (n.type === "table" ? "#93a1a1" : "#0f5566"), nodeStrokeWidth: 0, maskColor: "rgba(0,43,54,.6)" }),
      ),
      selectedTable &&
        h(Panel, {
          table: selectedTable,
          graph,
          state,
          onSelect: select,
          onClose: () => setState((s) => ({ ...s, selected: null })),
          pageUrl: `${cfg.base}${selectedTable.id}/v1/index.html`,
        }),
    ),
    h(
      "footer",
      { className: "legend" },
      h("span", null, "An arrow goes from a table to the table it refers to."),
      h("span", null, h("i", { className: "swatch solid" }), "Solid: the column is the whole key of the other table, so a value matches one row."),
      h(
        "span",
        null,
        h("i", { className: "swatch dashed" }),
        "Dashed: the join does not pick out one row. By name: a name is not a key and can match several rows. Part of a composite key: match the other key columns too. May be missing: not every value is in the other table, for example a hook in run_results, or a disabled resource, which is not in dag_nodes.",
      ),
      h("span", null, "Click a table to focus it. Click a domain header to open or close it."),
    ),
  );
}

function Panel({ table, graph, state, onSelect, onClose, pageUrl }) {
  const links = visibleLinks(graph, { ...state, hidden: [] });
  const refersTo = links.filter((l) => l.from === table.id);
  const referredBy = links.filter((l) => l.to === table.id);
  const kindNote = (k) => (KINDS[k].dashed ? ` (${KINDS[k].label.toLowerCase()})` : "");
  return h(
    "aside",
    { className: "panel" },
    h("button", { className: "close", onClick: onClose, "aria-label": "Close" }, "×"),
    h("h2", null, table.id),
    h("p", { className: "muted" }, `${table.domain} · ${table.columns.length} columns`),
    h("a", { className: "btn", href: pageUrl }, "Open schema page"),
    h("h3", null, "Refers to"),
    refersTo.length === 0
      ? h("p", { className: "muted" }, "Nothing")
      : h(
          "ul",
          null,
          refersTo.map((l, i) =>
            h("li", { key: i }, h("code", null, l.column), " → ", h("button", { className: "link", onClick: () => onSelect(l.to) }, l.to), kindNote(l.kind)),
          ),
        ),
    h("h3", null, "Referred to by"),
    referredBy.length === 0
      ? h("p", { className: "muted" }, "Nothing")
      : h(
          "ul",
          null,
          referredBy.map((l, i) =>
            h("li", { key: i }, h("button", { className: "link", onClick: () => onSelect(l.from) }, l.from), ".", h("code", null, l.column), kindNote(l.kind)),
          ),
        ),
    h("h3", null, "Columns"),
    h(
      "ul",
      { className: "cols" },
      table.columns.map((c) =>
        h("li", { key: c.name }, h("code", null, c.name), " ", h("span", { className: "muted" }, c.type), c.pk ? " PK" : "", c.fk ? " FK" : ""),
      ),
    ),
  );
}

async function main() {
  const res = await fetch(cfg.graph);
  if (!res.ok) throw new Error(`graph.json: ${res.status}`);
  const graph = await res.json();
  createRoot(root).render(h(ReactFlowProvider, null, h(Explorer, { graph })));
}

main().catch((e) => {
  root.textContent = `The diagram could not be loaded: ${e.message}`;
});
