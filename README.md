# schemas.getdbt.com
Schemas for describing and consuming dbt generated artifacts

See [this doc](https://www.notion.so/dbtlabs/Bump-Schema-Version-dd308bab6a044c7d8cb6935691732ab3?pvs=4) for detailed instructions on how to update schema docs.

Useful commands:
- `make install`: installs json-schema-for-humans
- `make json_schema version=<version number>`: copy JSON schema file from dbt-core into this repo
- `make html version=<version number>`: generate HTML file from JSON schema file