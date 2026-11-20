// Bundles the explorer into ../../static/erd/: erd-app.js, erd-app.css and
// LICENSES.txt. The output is committed, so the site needs no CDN and the
// Python build needs no Node. Run `npm install && npm run build` here after
// changing src/ or the dependencies, and commit the result.
import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../../static/erd");
mkdirSync(out, { recursive: true });

const result = await build({
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
  metafile: true,
  logLevel: "info",
});

// The licence text of every package that ended up in the bundle.
const packages = new Set();
for (const file of Object.keys(result.metafile.inputs)) {
  const m = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (m) packages.add(m[1]);
}
const notices = [];
for (const name of [...packages].sort()) {
  const dir = join(here, "node_modules", name);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const file = readdirSync(dir).find((f) => /^licen[cs]e(\.|$)/i.test(f));
  const text = file ? readFileSync(join(dir, file), "utf8").trim() : "(no licence file in the package)";
  notices.push(`${name} ${pkg.version} (${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license)})\n\n${text}`);
}
writeFileSync(
  join(out, "LICENSES.txt"),
  "Third-party software bundled in erd-app.js.\n\n" + notices.join("\n\n" + "=".repeat(72) + "\n\n") + "\n",
);
console.log(`licences for ${packages.size} packages`);
