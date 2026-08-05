# OASIS — OData to OpenAPI Converter

[![CI](https://github.com/Azure-Samples/odata-openapi-converter/actions/workflows/ci.yml/badge.svg)](https://github.com/Azure-Samples/odata-openapi-converter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Convert OData CSDL metadata to **OpenAPI 3.0** specifications that integrate as fully functional APIs into Azure API Management.

Available as a **web app**, **CLI**, and **standalone binary**.

---

## Web App

Use the hosted converter — no install required:

**[Launch Web App](https://converter.odata-openapi.net/)**

Drag and drop one or more OData metadata files (or an entire folder), convert, and download the results as a ZIP.

Before converting, you can optionally set a **Server URL**, **Title**, and **Description**, and enable three toggles that mirror the CLI flags: **Add $apply (aggregation) query option**, **Require $top (default 10)**, and **Include the /$batch endpoint**. Each toggle has an inline explanation in the UI — see [APIM-Ready Output](#apim-ready-output) for details.

---

## Supported Formats

| Input | Output |
|-------|--------|
| OData CSDL XML (`.xml`) | OpenAPI 3.0 JSON |
| OData EDMX (`.edmx`) | OpenAPI 3.0 JSON |
| OData CSDL JSON (`.json`) | OpenAPI 3.0 JSON |

Supports OData **v2**, **v3**, and **v4** metadata.

> **File size limit: 4 MiB.** Azure API Management limits OpenAPI spec imports to 4 MiB, so this tool enforces the same limit on input files.

---

## CLI

Pre-built binaries (no Node.js required) are available on the
[Releases](https://github.com/Azure-Samples/odata-openapi-converter/releases) page:

| Platform | Binary |
|----------|--------|
| Windows x64 | `oasis-converter-win-x64.exe` |
| macOS Intel | `oasis-converter-mac-x64` |
| macOS Apple Silicon | `oasis-converter-mac-arm64` |
| Linux x64 | `oasis-converter-linux-x64` |
| Linux ARM64 | `oasis-converter-linux-arm64` |

### Quick Start

```bash
# Convert a single file
oasis-converter convert service.xml

# Convert with custom title and server URL
oasis-converter convert -T "My API" -s https://your-server.com/sap/opu/odata/sap/API_NAME service.xml

# Convert with explicit output flag
oasis-converter convert --output-file api.json service.edmx

# Convert with optional APIM hardening: required $top and $apply aggregation
oasis-converter convert -R -A service.xml

# Batch-convert all files in a folder
oasis-converter batch ./input-folder

# Batch-convert recursively with a custom output directory
oasis-converter batch -r --target-dir ./output ./dir1 ./dir2

# Batch-convert with shared server URL
oasis-converter batch -s https://your-server.com/sap/opu/odata/sap/ -r ./input

# View metadata about an OData file
oasis-converter info service.xml
```

### Commands

| Command | Description |
|---------|-------------|
| `convert` | Convert a single OData CSDL file to OpenAPI |
| `batch` | Convert all OData files in one or more directories |
| `info` | Display metadata about an OData CSDL file (format, schemas, entity types) |
| `version` | Show version number |
| `help` | Display help information |

### convert options

| Flag | Description |
|------|-------------|
| `-o, --output-file <path>` | Output file path |
| `-s, --server-url <url>` | Base URL for the generated OpenAPI spec (e.g., `https://your-sap-server.com/sap/opu/odata/sap/API_NAME`) |
| `-T, --title <name>` | Custom title — how users find this API in the APIM workspace |
| `-D, --description <text>` | Custom API description for the generated spec (`info.description`) |
| `-A, --apply` | Add the `$apply` (aggregation) query option to all collection endpoints (off by default) |
| `-R, --require-top` | Make `$top` required with a default of `10` on all collection endpoints, guarding against unbounded full-table reads (off by default) |
| `-B, --include-batch` | Include the `/$batch` path — skipped by default because its batched contents can't be validated individually by APIM (off by default) |
| `--diagram` | Append an entity-relationship diagram to `info.description` (off by default) |
| `-V, --verbose` | Show detailed conversion logs |

### batch options

| Flag | Description |
|------|-------------|
| `-t, --target-dir <path>` | Output directory for converted files |
| `-s, --server-url <url>` | Base URL shared across all files |
| `-c, --concurrency <n>` | Maximum files to process in parallel (default: min(CPU count, 8)) |
| `-A, --apply` | Add the `$apply` (aggregation) query option to all collection endpoints (off by default) |
| `-R, --require-top` | Make `$top` required with a default of `10` on all collection endpoints (off by default) |
| `-B, --include-batch` | Include the `/$batch` path, skipped by default (off by default) |
| `--diagram` | Append an entity-relationship diagram to `info.description` (off by default) |
| `-r, --recursive` | Search subdirectories for OData files |
| `-O, --overwrite` | Overwrite existing output files |
| `-V, --verbose` | Show detailed conversion logs |

The `-A`, `-R`, and `-B` flags mirror the **$apply**, **Require $top**, and **Include /$batch** checkboxes in the [web app](#web-app). Use `oasis-converter <command> --help` for full details on any command.

---

## APIM-Ready Output

The generated OpenAPI specifications include post-processing optimizations for seamless Azure API Management import.

### Always applied

| Enhancement | Description |
|-------------|-------------|
| PUT methods | Added alongside PATCH for all updatable entities (SAP OData supports both) |
| HEAD methods | Root (`/`) and metadata (`/$metadata`) endpoints for CSRF token fetching; both `200` responses declare the `X-CSRF-Token` response header so consumers can see where SAP returns the token |
| If-Match headers | Added to PATCH, PUT, and DELETE operations for optimistic concurrency |
| SAP parameters | Standard SAP query parameters (`sap-client`, `sap-language`, etc.) and `x-csrf-token` header |
| Relaxed query options | `$select` / `$expand` / `$orderby` schemas are converted from array+enum to free-form `string`, so nested / wildcard / combined OData values pass strict APIM `validate-parameters` policies |
| Field descriptions | SAP field captions and tooltips become OpenAPI `title` / `description` for both V2 (`sap:label` / `sap:quickinfo`) and V4 (`Common.Label` / `Common.QuickInfo`) |
| Malformed-XML repair | Unescaped `&`, `<`, `>` inside attribute values (which SAP sometimes exports) are escaped in a pre-parse step so otherwise-invalid metadata still converts |
| Dangling `$ref` fix | Placeholder schemas created for unresolved component references |
| Localhost removal | Default `localhost` server URLs are stripped so APIM auto-configures the backend |

These transforms run automatically on every conversion — no configuration needed.

### Opt-in (CLI flags / web-app toggles)

| Enhancement | CLI flag | Web-app toggle | Description |
|-------------|----------|----------------|-------------|
| `$apply` aggregation | `-A, --apply` | Add $apply (aggregation) query option | Declares `$apply` on all collection endpoints so strict APIM policies accept aggregation requests. Enable only if your services support aggregation. |
| Required `$top` | `-R, --require-top` | Require $top (default 10) | Makes `$top` required with a default of `10` on all collection endpoints, guarding against unbounded full-table reads. |
| `/$batch` endpoint | `-B, --include-batch` | Include the /$batch endpoint | Includes the `/$batch` path, which is **skipped by default** because batched request contents cannot be validated individually by APIM. Enable only when batch access is deliberately granted. |
| Entity-relationship diagram | `--diagram` | Include entity-relationship diagram | Appends an externally hosted ER diagram to `info.description`. Disabled by default to keep APIM imports smaller. |

---

## Warnings

### "Invalid annotation target"

You may see warnings like:

```
Invalid annotation target 'MyNamespace.MyContainer/MyEntitySet'
```

This means some metadata annotations could not be resolved during conversion. These are informational only.

| Affected | Not affected |
|----------|-------------|
| Operation descriptions (may be blank) | All API endpoints (still fully generated) |
| Filter / sort restriction hints | Request / response schemas |
| Navigation property descriptions | HTTP methods (GET, POST, PATCH, DELETE, PUT) |

**No action is required.** The generated OpenAPI specification is functionally complete — all endpoints, schemas, and methods are present. Only some documentation annotations may be missing.

### "More than two annotation target path segments"

Same as above — an annotation could not be resolved. The annotation is skipped; all endpoints are still generated.

---

## Telemetry

This tool collects **anonymous** usage metrics to help improve quality and reliability.

### What we collect

| Data point | Description |
|---|---|
| Pseudonymous client ID | A random, anonymous identifier used to approximate unique clients. Not linked to any personal information. |
| Run metadata | Source (`web` or `cli`), total files processed, success/failure/warning counts, and wall-clock duration in milliseconds. |
| Error codes | Machine-readable error codes (e.g. `MALFORMED_XML`, `UNSUPPORTED_EXTENSION`). For internal errors only (5xx), a scrubbed error message is included with all file paths removed. |
| Skip data | Count of skipped files and the reason (e.g. unsupported extension). |
| Download flag | Whether the user downloaded the ZIP (web only). |

### What we do NOT collect

- File paths, file names, or file contents
- IP addresses or personally identifiable information
- OData metadata or OpenAPI output

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE.md) © Microsoft Corporation
