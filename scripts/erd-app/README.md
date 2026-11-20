# Interactive ERD

The page at `dbt/info-schema/erd/index.html`. It reads `dbt/info-schema/graph.json`
(written by the generator in dbt-labs/fs, never edited by hand) and draws the
tables as an explorable diagram: groups that open and close, click a table to
show it and its related tables, search, filters for the kinds of relationship, a
side panel, a minimap, and a URL that reopens the same view.

## How it is built

The bundle is built by hand, not by CI, and committed:

- `src/` is the source: `main.jsx` (the UI), `graph.js` (the logic, no React in
  it: what a view contains, the filters, search, the URL hash) and `styles.css`.
- `build.mjs` bundles it with esbuild into `static/erd/erd-app.js` and
  `static/erd/erd-app.css`.
- Nothing is loaded from a CDN: React, React Flow (`@xyflow/react`, MIT) and ELK
  (`elkjs`, EPL-2.0, for the layout) are inside the bundle. Their versions are
  pinned exactly in `package.json`, with a lockfile.
- `scripts/build_info_schema.py` does not touch the bundle. It only fills in
  `scripts/erd_explorer.html` with paths, so the fs sync workflow needs Python
  and no Node.

React Flow shows a small "React Flow" credit in a corner of the page; keep it.

## Changing it

You need Node 18 or newer (esbuild's requirement). The committed bundle was
built with Node 26 and npm 11.

```sh
make erd
# or, by hand:
cd scripts/erd-app
npm ci          # installs exactly what package-lock.json says
npm test        # the logic in src/graph.js
npm run build   # rewrites static/erd/
```

Commit the change to `src/` and the rebuilt `static/erd/` together.

Nothing checks that `static/erd/` matches `src/`. If you edit the source and do
not rebuild, the site keeps serving the old bundle. To check, rebuild and look at
`git status`: a clean tree for `static/erd/` means the committed bundle is
current.

Use `npm ci`, not `npm install`: `npm install` can change the lockfile, and a
rebuild from a changed lockfile may not match the committed bundle.

## Trying it locally

The page needs `graph.json`, which the generator in dbt-labs/fs writes, and it
fetches it, so it must be served over HTTP (opening the file directly does not
work).

```sh
# in a checkout of dbt-labs/fs
cargo run -p dbt-index-core --example info_schema_docs -- --out /tmp/info-schema-out

# in this repo
rm -rf dbt/info-schema && mkdir -p dbt/info-schema
cp -R /tmp/info-schema-out/info-schema/. dbt/info-schema/
make install && make info_schema_html
python3 -m http.server 8000
# open http://localhost:8000/dbt/info-schema/erd/index.html
```

Do not commit what that puts in `dbt/info-schema/` or the root `index.html`: the
sync workflow in dbt-labs/fs generates and commits those. After you have looked
at the page, put them back: `git checkout -- index.html dbt/info-schema && git clean -fd dbt/info-schema`.

While working on the UI, `npm run build` in this directory and a page reload are
enough: only the bundle changes.
