# schemas.getdbt.com

- [Updating Schemas](#updating-schemas)
  - [1. Generate new schemas in `dbt-core`](#1-generate-new-schemas-in-dbt-core)
  - [2. Copy schemas to `schemas.getdbt.com`](#2-copy-schemas-to-schemasgetdbtcom)
- [Available Commands](#useful-commands)


## Updating Schemas
### 1. Generate new schemas in `dbt-core`

1. Are there changes made in the `dbt-core` directory [/core/dbt/artifacts](https://github.com/dbt-labs/dbt-core/tree/main/core/dbt/artifacts) since last release? If not, then you can stop here, no schema changes have been made!

2. From `dbt-core`, run `cd core && hatch run json-schema`
    * This runs a script that generates the schemas for each artifact in a new `schemas` directory
    * This script creates schema files for all artifacts but you will only need to pay attention to the schema file that you incremented the version for

3. If you are unsure if any changes have been made, diff the generated artifacts to the artifacts that exist in the [schemas.getdbt.com](http://schemas.getdbt.com) repo. 
    Note: You have to filter out certain values such a dbt version number and date/time since that is all dependent on when the schema is generated and not on actual schema changes that exist.
    - Example filter diff (run from `dbt-core` repo):
        1. `diff -I '.*default*.**' -I '.*description*.**' schemas/dbt/catalog/v1.json ../schemas.getdbt.com/dbt/catalog/v1.json` 
        2. `diff -I '.*default*.**' -I '.*description*.**' schemas/dbt/manifest/v12.json ../schemas.getdbt.com/dbt/manifest/v12.json`
        3. `diff -I '.*default*.**' -I '.*description*.**' schemas/dbt/run-results/v6.json ../schemas.getdbt.com/dbt/run-results/v6.json`
        4. `diff -I '.*default*.**' -I '.*description*.**' schemas/dbt/sources/v3.json ../schemas.getdbt.com/dbt/sources/v3.json`

4. If the diffs contain more substantial changes than just a `default` or `description` change, we will need to bump the schema for that artifact. Consult with the Core Team to let them know of the bump needing to be done

### 2. Copy schemas to `schemas.getdbt.com`

1. Copy the new schema json file created by the script into the correct directory in `schemas.getdbt.com`
    1. `cp schemas/dbt/catalog/v1.json ../../schemas.getdbt.com/dbt/catalog`
    2. `cp schemas/dbt/manifest/v11.json ../../schemas.getdbt.com/dbt/manifest`
    3. `cp schemas/dbt/run-results/v5.json ../../schemas.getdbt.com/dbt/run-results`
    4. `cp schemas/dbt/sources/v3.json ../../schemas.getdbt.com/dbt/sources`

2. Go into the [`schemas.getdbt.com`](http://schemas.getdbt.com) repo

3. Setup a new version directory in the correct artifact directory
    1. `cd dbt/<artifact>` (i.e. dbt/manifest)
    2. `mkdir v<new schema version>` (i.e. v6)

4. Install the following tool used to create html/css files used for the https://schemas.getdbt.com/ website
    1. `pipx install json-schema-for-humans` 

5. Generate the associated html/css files
    1. `generate-schema-doc v<version>.json v<version>/index.html` 

6. Verify the following files have been created under the `v<version>` directory:
    1. `index.html`, `schema_doc.css`, `schema_doc.min.js`

7. Update the index.html in the **base** directory with the new schema version entry
    1. Ex: https://github.com/dbt-labs/schemas.getdbt.com/pull/13/files#diff-0eb547304658805aad788d320f10bf1f292797b5e6d745a3bf617584da017051

8. Create PR to `main`, get approval, and merge before the next step
    1. Should have 4 new files and 1 edited file
    2. Example PR: https://github.com/dbt-labs/schemas.getdbt.com/pull/13


## Info schema

`dbt/info-schema/` holds the JSON Schemas, the graph data for the interactive ERD, and generated HTML for the dbt information schema (`dbt.*`, `dbt_rt.*`), and the "Info Schema" section of the root `index.html`. Do not edit them here.

The `sync-info-schema-to-schemas` workflow in [dbt-labs/fs](https://github.com/dbt-labs/fs) generates the raw files from `INFO_SCHEMA`, runs `scripts/build_info_schema.py` on a clone of this repo to build the HTML, and opens one PR with everything. Merging that PR updates the site; there is no step after the merge. The Vercel preview of the PR shows the finished site.

To build locally from the raw files: `make install && make info_schema_html`.

The ERD page (`dbt/info-schema/erd/index.html`) is an interactive diagram. Its code is not built by the sync workflow: it is bundled from `scripts/erd-app/` into `static/erd/` and committed. After changing anything in `scripts/erd-app/`, run `make erd` and commit the result. See [scripts/erd-app/README.md](scripts/erd-app/README.md), which also explains how to try the page locally.

## Available Commands:
- `make install`: installs json-schema-for-humans
- `make info_schema_html`: builds the info schema HTML from `dbt/info-schema/`
- `make erd`: rebuilds the interactive ERD bundle in `static/erd/` (needs Node 18 or newer)
- `make json_schema version=<version number>`: copy JSON schema file from dbt-core into this repo
- `make html version=<version number>`: generate HTML file from JSON schema file
- `make info_schema_html`: build the info schema HTML from `dbt/info-schema/`