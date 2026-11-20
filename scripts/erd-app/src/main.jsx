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
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
  useStore,
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
  describeLink,
  elkGraph,
  focusGraph,
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

const HEAD_HINT = "Click to open or close, double-click to show only this group, drag to move";

function DomainNode({ data }) {
  const { name, count, open, dim } = data;
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
      ? h("div", { className: "domain-bar" }, h("div", { className: "domain-head", title: HEAD_HINT }, head))
      : h("div", { className: "domain-head", title: HEAD_HINT }, head),
  );
}

/** An edge. The selected one carries a card above the tables; others a short tag. */
function LinkEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }) {
  const [path, x, y] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { card, tag, links } = data;
  // Labels keep their size whatever the zoom, so they stay readable.
  const zoom = useStore((st) => st.transform[2]);
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
              transform: `translate(${x}px, ${card ? y - 16 / zoom : y}px) scale(${1 / zoom}) translate(-50%, ${card ? "-100%" : "-50%"})`,
              zIndex: card ? 1000 : 5,
            },
          },
          card
            ? links.map((l, i) =>
                h(
                  "div",
                  { key: i, className: "edge-line" },
                  h("code", null, describeLink(l)),
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
  // The nodes React Flow shows. They live in state so that a drag changes one
  // node and keeps the measured size of the rest; rebuilding them all on every
  // mouse move made the whole graph flicker.
  const [nodes, setNodes] = useState([]);
  const shownLaid = useRef(null);
  const [edgeKey, setEdgeKey] = useState(null);
  // What is on show: the chosen group, then a chosen table and its relatives.
  const scope = useMemo(() => scoped(fullGraph, state.only), [fullGraph, state.only]);
  const graph = useMemo(() => focusGraph(scope, state, state.selected), [scope, state.selected, state.hidden.join(",")]);
  const focusing = graph !== scope;
  const [query, setQuery] = useState("");
  const wrap = useRef(null);
  const pendingFit = useRef(null);

  // Keyed by content: a new array with the same entries must not trigger a layout,
  // which would also throw away where the user moved things.
  const openKey = state.open.join(",");
  const hiddenKey = state.hidden.join(",");
  // Every domain that has a table in the focus is open.
  const view = useMemo(
    () => buildView(graph, focusing ? { ...state, open: graph.domains.map((d) => d.name) } : state),
    [graph, focusing, openKey, hiddenKey],
  );
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
      if (live) setLaid(result);
    });
    return () => {
      live = false;
    };
  }, [graph, view, state.columns]);

  const onNodesChange = useCallback((changes) => setNodes((ns) => applyNodeChanges(changes, ns)), []);

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
      pendingFit.current = "all";
    },
    [byId],
  );

  const solo = useCallback((name) => {
    setState((s) => {
      if (s.only) return { ...s, only: null };
      // A selected table stays if it is in this group; otherwise it is not in view.
      const keep = s.selected && byId.get(s.selected)?.domain === name ? s.selected : null;
      return { ...s, only: name, open: [name], selected: keep };
    });
    setEdgeKey(null);
    pendingFit.current = "all";
  }, [byId]);

  const focus = null;
  const focusDomains = null;

  const { base, edges } = useMemo(() => {
    if (!laid) return { base: [], edges: [] };
    const nodes = [];
    for (const d of laid.children) {
      const name = d.id.replace(/^domain:/, "");
      const open = view.open.has(name);
      nodes.push({
        id: d.id,
        type: "domain",
        position: { x: d.x, y: d.y },
        style: { width: d.width, height: d.height },
        data: {
          name,
          open,
          count: (view.tablesOf.get(name) ?? []).length,
          dim: focusDomains && !focusDomains.has(name),
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
          position: { x: c.x, y: c.y },
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
    return { base: nodes, edges };
  }, [laid, view, state.columns, state.selected, state.only, edgeKey, byId]);

  // Take the freshly built nodes, but keep where the user dragged things (and
  // each node's measured size) until the next layout.
  useEffect(() => {
    const fresh = shownLaid.current !== laid;
    shownLaid.current = laid;
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return base.map((n) => {
        const o = old.get(n.id);
        if (!o) return n;
        return { ...n, position: fresh ? n.position : o.position, measured: o.measured, width: o.width, height: o.height };
      });
    });
  }, [base, laid]);

  // Fit after a layout that followed a user action.
  useEffect(() => {
    if (!laid || !pendingFit.current) return;
    pendingFit.current = null;
    const id = setTimeout(() => {
      const padding = 0.15;
      flow.fitView({ padding, maxZoom: 1.2, duration: 300 });
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
            setState((s) => ({
              ...s,
              only,
              selected: only && s.selected && byId.get(s.selected)?.domain !== only ? null : s.selected,
              open: only ? [only] : s.open,
            }));
            setEdgeKey(null);
            pendingFit.current = "all";
          },
        },
        h("option", { value: "" }, "All groups"),
        fullGraph.domains.map((d) => h("option", { key: d.name, value: d.name }, d.name)),
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
        "div",
        { className: "canvas" },
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
              const name = node.id.replace(/^domain:/, "");
              const open = view.open.has(name);
              if (focusing) return;
              if (!open || t.closest(".domain-bar")) setOpen(name, !open);
            }
          },
          onNodeDoubleClick: (_, node) => {
            if (node.type === "domain") solo(node.id.replace(/^domain:/, ""));
          },
          // The focused table stays: its neighbours are the view.
          onEdgeClick: (_, edge) => setEdgeKey(`${edge.source}>${edge.target}`),
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
      ),
      selectedTable &&
        h(Panel, {
          table: selectedTable,
          graph: fullGraph,
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
      h("span", null, h("i", { className: "swatch solid" }), "Solid: the columns are the whole key of the other table (one column, or several together), so a value matches one row."),
      h(
        "span",
        null,
        h("i", { className: "swatch dashed" }),
        "Dashed: the join does not pick out one row. By name: a name is not a key and can match several rows. May be missing: not every value is in the other table, for example a hook in run_results, or a disabled resource, which is not in dag_nodes.",
      ),
      h("span", null, "Click a table to show it and its related tables, and click the background to go back. Click a group to open or close it. Double-click a group to show only that group, and again to show all."),
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
            h("li", { key: i }, h("code", null, l.on?.length > 1 ? `(${l.column})` : l.column), " → ", h("button", { className: "link", onClick: () => onSelect(l.to) }, l.to), kindNote(l.kind)),
          ),
        ),
    h("h3", null, "Referred to by"),
    referredBy.length === 0
      ? h("p", { className: "muted" }, "Nothing")
      : h(
          "ul",
          null,
          referredBy.map((l, i) =>
            h("li", { key: i }, h("button", { className: "link", onClick: () => onSelect(l.from) }, l.from), ".", h("code", null, l.on?.length > 1 ? `(${l.column})` : l.column), kindNote(l.kind)),
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
