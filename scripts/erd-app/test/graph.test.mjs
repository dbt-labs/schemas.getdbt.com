import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_STATE, buildView, fromHash, neighbours, search, toHash } from "../src/graph.js";

const col = (name, pk = false, fk = false) => ({ name, type: "string", pk, fk });
const graph = {
  domains: [
    { name: "a", tables: ["t.one", "t.two"] },
    { name: "b", tables: ["t.three"] },
  ],
  tables: [
    { id: "t.one", domain: "a", columns: [col("id", true, true), col("name")] },
    { id: "t.two", domain: "a", columns: [col("id", true)] },
    { id: "t.three", domain: "b", columns: [col("one_id", false, true), col("label")] },
  ],
  links: [
    { from: "t.one", to: "t.two", column: "id", kind: "key", subtype: true },
    { from: "t.three", to: "t.one", column: "one_id", kind: "name", subtype: false },
    { from: "t.three", to: "t.two", column: "label", kind: "key", subtype: false },
  ],
};

test("collapsed domains merge the links between them", () => {
  const view = buildView(graph, DEFAULT_STATE);
  // The link inside domain a is not drawn; the two from b to a are merged.
  assert.equal(view.edges.length, 1);
  assert.equal(view.edges[0].links.length, 2);
  assert.equal(view.edges[0].source, "domain:b");
  assert.equal(view.edges[0].dashed, false);
});

test("an open domain shows its tables and the links between them", () => {
  const view = buildView(graph, { ...DEFAULT_STATE, open: ["a"] });
  const ends = view.edges.map((e) => `${e.source}>${e.target}`).sort();
  assert.deepEqual(ends, ["domain:b>t.one", "domain:b>t.two", "t.one>t.two"]);
});

test("hiding a kind or subtype links removes those links", () => {
  const open = { ...DEFAULT_STATE, open: ["a", "b"] };
  assert.equal(buildView(graph, open).edges.length, 3);
  assert.equal(buildView(graph, { ...open, hidden: ["name"] }).edges.length, 2);
  assert.equal(buildView(graph, { ...open, hidden: ["subtype"] }).edges.length, 2);
});

test("a merged edge is dashed only if every link in it is", () => {
  const state = { ...DEFAULT_STATE, hidden: ["key"] };
  const view = buildView(graph, state);
  assert.equal(view.edges.length, 1);
  assert.equal(view.edges[0].dashed, true);
});

test("neighbours are one step away over the visible links", () => {
  assert.deepEqual([...neighbours(graph, DEFAULT_STATE, "t.one")].sort(), ["t.one", "t.three", "t.two"]);
  const hidden = { ...DEFAULT_STATE, hidden: ["name"] };
  assert.deepEqual([...neighbours(graph, hidden, "t.one")].sort(), ["t.one", "t.two"]);
});

test("search matches table names first, then columns", () => {
  assert.deepEqual(search(graph, "three").map((h) => h.table), ["t.three"]);
  const byColumn = search(graph, "label");
  assert.equal(byColumn[0].table, "t.three");
  assert.equal(byColumn[0].column, "label");
  assert.deepEqual(search(graph, "  "), []);
});

test("the URL hash round-trips the view and ignores unknown values", () => {
  const state = { open: ["a"], hidden: ["name", "subtype"], columns: "all", selected: "t.one" };
  assert.deepEqual(fromHash(`#${toHash(state)}`, graph), state);
  const junk = fromHash("#t=nope&open=zzz&hide=bogus,name&cols=weird", graph);
  assert.deepEqual(junk, { open: [], hidden: ["name"], columns: "keys", selected: null });
});
