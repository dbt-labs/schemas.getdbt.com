# Interactive ERD

The page at `dbt/info-schema/erd/index.html`. It reads `dbt/info-schema/graph.json`
(written by the generator in dbt-labs/fs, never edited by hand) and draws the
tables as an explorable diagram: domains that open and close, click a table to
focus it, search, filters for the kinds of relationship, a side panel, a
minimap, and a link that reopens the same view.

Nothing is loaded from a CDN. The built code is committed:

- `static/erd/erd-app.js`, `static/erd/erd-app.css`: the bundle
- `static/erd/LICENSES.txt`: the licence text of every package inside it

`scripts/build_info_schema.py` only fills in `scripts/erd_explorer.html`, so the
sync workflow needs Python and no Node.

## Changing it

```sh
cd scripts/erd-app
npm install
npm test        # the pure logic in src/graph.js
npm run build   # rewrites static/erd/; commit the result
```

Dependencies are pinned to exact versions in `package.json`: React, React Flow
(`@xyflow/react`, MIT), and ELK (`elkjs`, EPL-2.0) for the layout. React Flow
shows a small "React Flow" credit in the corner; keep it.

`src/graph.js` holds the logic with no React in it (what a view contains, the
filters, search, the URL hash). `src/main.jsx` is the UI.
