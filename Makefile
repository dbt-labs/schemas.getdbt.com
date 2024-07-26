.PHONY: install
install:
	pip install json-schema-for-humans

# Generate new HTML. Should be updated for newest version. Runs with argument `version`:
# `make html version=12`
.PHONY: html
html:
	generate-schema-doc dbt/manifest/v$(version).json dbt/manifest/v$(version)/index.html

# Copy JSON schema from dbt-core. Assumes GitHub repos are stored in the same directory.
# Runs with argument `version`: `make json_schema version=12`
.PHONY: json_schema
json_schema:
	cp ../dbt-core/schemas/dbt/manifest/v$(version).json dbt/manifest/v$(version).json
	