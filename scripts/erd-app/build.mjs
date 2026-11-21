// Bundles the explorer into ../../static/erd/: erd-app.js and erd-app.css.
// The output is committed, so the site needs no CDN and the
// Python build needs no Node. Run `npm install && npm run build` here after
// changing src/ or the dependencies, and commit the result.
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../../static/erd");
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, "src/main.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  jsx: "transform",
  outfile: join(out, "erd-app.js"),
  loader: { ".css": "css" },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
  logLevel: "info",
});
