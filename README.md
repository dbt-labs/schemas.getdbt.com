# schemas.getdbt.com

- [Artifact Schemas (manifest, catalog, run-results, sources)](#updating-schemas)
  - [1. Generate new schemas in `dbt-core`](#1-generate-new-schemas-in-dbt-core)
  - [2. Copy schemas to `schemas.getdbt.com`](#2-copy-schemas-to-schemasgetdbtcom)
- [Config Schemas (dbt_project.yml, profiles.yml, etc.)](#config-schemas)
- [Available Commands](#useful-commands)


## Config Schemas

`dbt/configs/` hosts the JSON schemas used to validate dbt's YAML *config*
files — `dbt_project.yml`, resource `schema.yml` files, `profiles.yml`,
`selectors.yml`, `packages.yml`, `dependencies.yml`, `catalogs.yml`, and
`dbt_cloud.yml`. This is a distinct pipeline from the artifact schemas below:

- **Source of truth**: the `dbt-schemas` crate in
  [`dbt-labs/fs`](https://github.com/dbt-labs/fs), via `dbt man --schema
  <type>` (Fusion) and `dbt man --pre-schema <type>` (Core-compatible).
- **Naming**: each type gets `dbt/configs/<name>/latest.json`
  (Core/`--pre-schema`, where generated) and
  `dbt/configs/<name>/latest-fusion.json` (Fusion/`--schema`). There is no
  independent schema-version number for these files the way there is for
  artifacts — `latest[-fusion]` always reflects the most recent release.
- **Update mechanism (in progress)**: historically these were hand-maintained
  in [`dbt-labs/dbt-jsonschema`](https://github.com/dbt-labs/dbt-jsonschema)
  and consumed by editors directly from GitHub raw URLs. `fs` already runs
  [`sync-json-schemas-to-dbt-jsonschema.yml`](https://github.com/dbt-labs/fs/blob/main/.github/workflows/sync-json-schemas-to-dbt-jsonschema.yml)
  on every release to regenerate and auto-merge these files there; the
  content in this directory is bootstrapped from that pipeline's current
  output. See [dbt-core#15887](https://github.com/dbt-labs/dbt-core/issues/15887)
  for making this CDN the automated target directly (rather than a manual
  bootstrap), ahead of retiring `dbt-jsonschema`
  ([dbt-core#15886](https://github.com/dbt-labs/dbt-core/issues/15886)).

## Artifact Schemas
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


## Available Commands:
- `make install`: installs json-schema-for-humans
- `make json_schema version=<version number>`: copy JSON schema file from dbt-core into this repo
- `make html version=<version number>`: generate HTML file from JSON schema file