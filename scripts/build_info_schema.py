#!/usr/bin/env python3
"""Build the HTML for the info schema from the raw files in dbt/info-schema/.

Input, synced from dbt-labs/fs (never edited by hand):
  dbt/info-schema/index.json
  dbt/info-schema/<table>/v1.json
  dbt/info-schema/erd.mmd, erd-<domain>.mmd

Output:
  dbt/info-schema/<table>/v1/index.html (+ css, js)   json-schema-for-humans
  dbt/info-schema/erd/index.html                       Mermaid ERDs
  the "Info Schema" section of the root index.html

Run from anywhere: `make info_schema_html`.
"""

import html
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DBT = REPO / "dbt"
INFO = DBT / "info-schema"
ROOT_PAGE = REPO / "index.html"

# Pinned. The site CSP allows scripts from any https host (see vercel.json).
MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs"

START = "<!-- info-schema:start -->"
END = "<!-- info-schema:end -->"

KEYS_NOTE = (
    "Primary and foreign keys are logical documentation. "
    "They are declared, not enforced: nothing checks them."
)


def load_index() -> dict:
    return json.loads((INFO / "index.json").read_text())


def remove_stale_tables(index: dict) -> None:
    """Drop directories of tables that left the index.

    The sync deletes a removed table's JSON but keeps the HTML it excludes
    from `--delete`, so a leftover directory holds only generated files.
    """
    keep = {t["name"] for t in index["tables"]} | {"erd"}
    for path in INFO.iterdir():
        if path.is_dir() and path.name not in keep:
            shutil.rmtree(path)


def build_table_pages(index: dict) -> None:
    for table in index["tables"]:
        for version in table["versions"]:
            schema = INFO / table["name"] / f"{version}.json"
            out = INFO / table["name"] / version / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            # No footer: it carries the generation date, which would change
            # every page on every run.
            subprocess.run(
                [
                    "generate-schema-doc",
                    "--config",
                    "with_footer=false",
                    str(schema),
                    str(out),
                ],
                check=True,
            )


def build_erd_page(index: dict) -> None:
    sections = []
    nav = []
    for diagram in index["diagrams"]:
        name = diagram["name"]
        source = (DBT / diagram["path"]).read_text()
        nav.append(f'<a href="#{html.escape(name)}">{html.escape(name)}</a>')
        sections.append(
            f'<section id="{html.escape(name)}">\n'
            f"<h2>{html.escape(name)}</h2>\n"
            f'<p><a href="../{html.escape(Path(diagram["path"]).name)}">raw .mmd</a></p>\n'
            f'<pre class="mermaid">\n{html.escape(source)}</pre>\n'
            "</section>"
        )
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>dbt info schema: entity relationship diagrams</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 2rem; }}
    nav a {{ margin-right: 1rem; }}
    .note {{ background: #fff8e1; padding: .75rem 1rem; border-left: 4px solid #f5a623; }}
    section {{ margin-top: 2.5rem; overflow-x: auto; }}
  </style>
</head>
<body>
  <p><a href="../../../index.html">&larr; dbt JSON Schemas</a></p>
  <h1>Info schema: entity relationship diagrams</h1>
  <p class="note">{html.escape(KEYS_NOTE)}</p>
  <nav>{" ".join(nav)}</nav>
  {chr(10).join(sections)}
  <script type="module">
    import mermaid from "{MERMAID_URL}";
    mermaid.initialize({{ startOnLoad: true, maxTextSize: 1000000 }});
  </script>
</body>
</html>
"""
    out = INFO / "erd" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page)


def root_section(index: dict) -> str:
    items = []
    for table in index["tables"]:
        name = table["name"]
        versions = ", ".join(
            f'<a href="dbt/info-schema/{name}/{v}/index.html">{v}</a> '
            f'(<a href="dbt/info-schema/{name}/{v}.json">raw</a>)'
            for v in table["versions"]
        )
        items.append(f"      <li>{html.escape(name)} {versions}</li>")
    return "\n".join(
        [
            START,
            "    <h3>Info Schema</h3>",
            f"    <p style=\"font-size: 70%\">{html.escape(KEYS_NOTE)}</p>",
            "    <ul>",
            '      <li><a href="dbt/info-schema/erd/index.html">ERD</a></li>',
            *items,
            "    </ul>",
            "    " + END,
        ]
    )


def update_root_page(index: dict) -> None:
    page = ROOT_PAGE.read_text()
    section = root_section(index)
    if START in page and END in page:
        head, rest = page.split(START, 1)
        _, tail = rest.split(END, 1)
        # `head` ends with the indent of the start marker; `section` starts
        # with the marker, so drop that indent to avoid doubling it.
        page = head.rstrip(" ") + "    " + section.lstrip() + tail
    else:
        marker = "  </main>"
        if marker not in page:
            sys.exit("index.html has no </main> to insert the Info Schema section before")
        page = page.replace(marker, "    " + section.lstrip() + "\n" + marker, 1)
    ROOT_PAGE.write_text(page)


def main() -> None:
    index = load_index()
    remove_stale_tables(index)
    build_table_pages(index)
    build_erd_page(index)
    update_root_page(index)


if __name__ == "__main__":
    main()
