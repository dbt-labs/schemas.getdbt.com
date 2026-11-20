// Pure functions behind the explorer: view state, filtering, and the layout
// input. No React, so they can be tested on their own.

export const KINDS = {
  key: { label: "Key", dashed: false },
  name: { label: "By name", dashed: true },
  "partial-key": { label: "Part of a composite key", dashed: true },
  "may-be-missing": { label: "May be missing", dashed: true },
};

// Layout sizes, in pixels.
export const TABLE_WIDTH = 230;
export const ROW_HEIGHT = 18;
export const HEADER_HEIGHT = 30;
export const DOMAIN_PAD = 24;
export const DOMAIN_HEADER = 36;
export const COLLAPSED_SIZE = { width: 220, height: 64 };

export const DEFAULT_STATE = {
  open: [], // expanded domains
  hidden: [], // hidden link kinds, plus "subtype" for subtype links
  columns: "keys", // "keys" or "all"
  selected: null, // a table id
  only: null, // show just this domain
};

/** The graph a view shows: all of it, or one domain and the links inside it. */
export function scoped(graph, only) {
  if (!only || !graph.domains.some((d) => d.name === only)) return graph;
  const tables = graph.tables.filter((t) => t.domain === only);
  const ids = new Set(tables.map((t) => t.id));
  return {
    ...graph,
    domains: graph.domains.filter((d) => d.name === only),
    tables,
    links: graph.links.filter((l) => ids.has(l.from) && ids.has(l.to)),
  };
}

/** The columns a table node lists. */
export function visibleColumns(table, mode) {
  return mode === "all"
    ? table.columns
    : table.columns.filter((c) => c.pk || c.fk);
}

export function tableHeight(table, mode) {
  return HEADER_HEIGHT + Math.max(visibleColumns(table, mode).length, 1) * ROW_HEIGHT + 8;
}

/** Links that pass the filters. */
export function visibleLinks(graph, state) {
  const hidden = new Set(state.hidden);
  return graph.links.filter(
    (l) => !hidden.has(l.kind) && !(l.subtype && hidden.has("subtype")),
  );
}

/**
 * The node and edge lists to lay out. An expanded domain holds its tables; a
 * collapsed one is a single node, and the links that touch it are merged per
 * pair of nodes.
 */
export function buildView(graph, state) {
  const open = new Set(state.open);
  const domainOf = new Map(graph.tables.map((t) => [t.id, t.domain]));
  const tablesOf = new Map();
  for (const t of graph.tables) {
    if (!tablesOf.has(t.domain)) tablesOf.set(t.domain, []);
    tablesOf.get(t.domain).push(t);
  }
  const endpoint = (id) => {
    const d = domainOf.get(id);
    return open.has(d) ? id : `domain:${d}`;
  };
  const merged = new Map();
  for (const l of visibleLinks(graph, state)) {
    const source = endpoint(l.from);
    const target = endpoint(l.to);
    if (source === target) continue;
    const key = `${source}\u0000${target}`;
    const entry = merged.get(key) ?? { source, target, links: [] };
    entry.links.push(l);
    merged.set(key, entry);
  }
  const edges = [...merged.values()].map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    links: e.links,
    dashed: e.links.every((l) => KINDS[l.kind].dashed),
  }));
  return { open, tablesOf, edges };
}

/** Table ids one step from `id`, over the visible links. */
export function neighbours(graph, state, id) {
  const out = new Set([id]);
  for (const l of visibleLinks(graph, state)) {
    if (l.from === id) out.add(l.to);
    if (l.to === id) out.add(l.from);
  }
  return out;
}

/** Tables whose name or a column matches `q`, best matches first. */
export function search(graph, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits = [];
  for (const t of graph.tables) {
    const name = t.id.toLowerCase();
    if (name.includes(needle)) {
      hits.push({ table: t.id, rank: name.endsWith(needle) ? 0 : 1, column: null });
      continue;
    }
    const col = t.columns.find((c) => c.name.toLowerCase().includes(needle));
    if (col) hits.push({ table: t.id, rank: 2, column: col.name });
  }
  return hits.sort((a, b) => a.rank - b.rank || a.table.localeCompare(b.table)).slice(0, 12);
}

/** State to and from the URL hash, so a link reopens the same view. */
export function toHash(state) {
  const p = new URLSearchParams();
  if (state.selected) p.set("t", state.selected);
  if (state.open.length) p.set("open", state.open.join(","));
  if (state.hidden.length) p.set("hide", state.hidden.join(","));
  if (state.columns !== "keys") p.set("cols", state.columns);
  if (state.only) p.set("only", state.only);
  return p.toString();
}

export function fromHash(hash, graph) {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const known = new Set(graph.domains.map((d) => d.name));
  const split = (v) => (v ? v.split(",").filter(Boolean) : []);
  const validKinds = new Set([...Object.keys(KINDS), "subtype"]);
  const t = p.get("t");
  const table = graph.tables.find((x) => x.id === t);
  return {
    ...DEFAULT_STATE,
    selected: table ? table.id : null,
    open: split(p.get("open")).filter((d) => known.has(d)),
    hidden: split(p.get("hide")).filter((k) => validKinds.has(k)),
    columns: p.get("cols") === "all" ? "all" : "keys",
    only: known.has(p.get("only")) ? p.get("only") : null,
  };
}

/** The ELK graph for a view: domains as containers, tables inside them. */
export function elkGraph(graph, state, view) {
  const children = graph.domains.map((d) => {
    const tables = view.tablesOf.get(d.name) ?? [];
    if (!view.open.has(d.name)) {
      return { id: `domain:${d.name}`, ...COLLAPSED_SIZE };
    }
    return {
      id: `domain:${d.name}`,
      layoutOptions: {
        "elk.padding": `[top=${DOMAIN_HEADER + DOMAIN_PAD},left=${DOMAIN_PAD},bottom=${DOMAIN_PAD},right=${DOMAIN_PAD}]`,
        "elk.spacing.nodeNode": "28",
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
      },
      children: tables.map((t) => ({
        id: t.id,
        width: TABLE_WIDTH,
        height: tableHeight(t, state.columns),
      })),
    };
  });
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.componentComponent": "60",
    },
    children,
    edges: view.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
}
