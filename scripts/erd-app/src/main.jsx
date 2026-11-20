import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
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
  const { name, count, open, dim, onToggle } = data;
  return h(
    "div",
    { className: `domain-node${open ? " open" : ""}${dim ? " dim" : ""}` },
    h(Handle, { type: "target", position: Position.Left, isConnectable: false }),
    h(Handle, { type: "source", position: Position.Right, isConnectable: false }),
    h(
      "button",
      { className: "domain-head", onClick: onToggle, title: open ? "Collapse" : "Expand" },
      h("span", { className: "caret" }, open ? "▾" : "▸"),
      h("strong", null, name),
      h("span", { className: "muted" }, `${count} table${count === 1 ? "" : "s"}`),
    ),
  );
}

const nodeTypes = { table: TableNode, domain: DomainNode };

function Explorer({ graph }) {
  const flow = useReactFlow();
  const [state, setState] = useState(() => fromHash(window.location.hash, graph));
  const [laid, setLaid] = useState(null);
  const [query, setQuery] = useState("");
  const wrap = useRef(null);
  const pendingFit = useRef(null);

  const view = useMemo(() => buildView(graph, state), [graph, state.open, state.hidden]);
  const byId = useMemo(() => new Map(graph.tables.map((t) => [t.id, t])), [graph]);

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
        return { ...s, selected: id, open: [...open] };
      });
      pendingFit.current = id;
    },
    [byId],
  );

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
        position: { x: d.x, y: d.y },
        style: { width: d.width, height: d.height },
        data: {
          name,
          open,
          count: (view.tablesOf.get(name) ?? []).length,
          dim: focusDomains && !focusDomains.has(name),
          onToggle: () => setOpen(name, !open),
        },
        draggable: true,
        selectable: false,
      });
      for (const c of d.children ?? []) {
        nodes.push({
          id: c.id,
          type: "table",
          parentId: d.id,
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
      const touches = state.selected && (e.source === state.selected || e.target === state.selected);
      const dim = state.selected && !touches;
      const labelled = touches ? e.links.map((l) => l.column).filter((v, i, a) => a.indexOf(v) === i) : [];
      // A merged edge between collapsed domains shows how many links it holds.
      const aggregated = e.source.startsWith("domain:") || e.target.startsWith("domain:");
      const label = touches ? labelled.join(", ") : aggregated ? `${e.links.length}` : undefined;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label,
        className: `${e.dashed ? "dashed" : ""}${dim ? " dim" : ""}${touches ? " active" : ""}`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        type: "default",
      };
    });
    return { nodes, edges };
  }, [laid, view, state.columns, state.selected, byId]);

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

  const hits = search(graph, query);
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
      cfg.mmd && h("a", { className: "btn", href: cfg.mmd, download: true }, "Download .mmd"),
      cfg.graph && h("a", { className: "btn", href: cfg.graph, download: true }, "Download .json"),
      cfg.staticUrl && h("a", { className: "btn", href: cfg.staticUrl }, "Static diagrams"),
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
          minZoom: 0.1,
          maxZoom: 2,
          fitView: true,
          fitViewOptions: { padding: 0.15 },
          nodesConnectable: false,
          onNodeClick: (_, node) => {
            if (node.type === "table") select(node.id);
          },
          onPaneClick: () => setState((s) => ({ ...s, selected: null })),
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
      h("span", null, h("i", { className: "swatch solid" }), "Key: each value matches one row"),
      h("span", null, h("i", { className: "swatch dashed" }), "Dashed: the join does not pick out a single row (by name, part of a composite key, or may be missing)"),
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
