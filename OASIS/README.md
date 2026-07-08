# OASIS — OData to OpenAPI Converter

Convert OData CSDL/EDMX metadata (v2, v3, v4) to fully compliant OpenAPI 3.0 specifications.

## Features

- Converts XML (EDMX) and JSON (CSDL) OData metadata to OpenAPI 3.0
- Supports OData v2, v3, and v4
- Adds SAP-specific parameters (sap-client, sap-language, x-csrf-token, etc.)
- Adds HEAD methods for CSRF token fetching (with `X-CSRF-Token` response header)
- Configurable server URL, API title, and API description
- Opt-in APIM hardening: `$apply` aggregation, required `$top`, and `/$batch` inclusion
- Available as CLI, web app, or standalone binary
- Batch conversion with parallel processing

## Installation

### As a CLI tool (npm)

```bash
npm install -g oasis-odata-openapi
```

### As a standalone binary

Download the pre-built binary for your platform from the [Releases](https://github.com/Azure-Samples/odata-openapi-converter/releases) page:

- Windows: `oasis-converter-win-x64.exe`
- macOS (Intel): `oasis-converter-mac-x64`
- macOS (Apple Silicon): `oasis-converter-mac-arm64`
- Linux: `oasis-converter-linux-x64` / `oasis-converter-linux-arm64`

## CLI Usage

### Convert a single file

```bash
odata-converter convert <input-file> [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `-o, --output-file <path>` | Output file path (overrides positional output; defaults to `<input>-openapi.json`) |
| `-s, --server-url <url>` | Base URL for the generated OpenAPI spec (e.g., `https://your-server.com/sap/opu/odata/sap/API_NAME`) |
| `-T, --title <title>` | Custom title for `openapi.info.title` (how users find this API in the APIM workspace) |
| `-D, --description <text>` | Custom API description (`info.description`); the ER diagram is still appended after it |
| `-A, --apply` | Add the `$apply` (aggregation) query option to all collection endpoints (off by default) |
| `-R, --require-top` | Make `$top` required with a default of `10` on all collection endpoints (off by default) |
| `-B, --include-batch` | Include the `/$batch` path, skipped by default for security (off by default) |
| `-V, --verbose` | Show detailed step-by-step conversion logs |

**Example:**

```bash
odata-converter convert metadata.xml --server-url https://your-server.com/sap/opu/odata/sap/API_NAME --title "My API"

# With optional APIM hardening (required $top + $apply aggregation)
odata-converter convert -R -A metadata.xml
```

### Batch convert a folder

```bash
odata-converter batch <input-folder> [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `-t, --target-dir <path>` | Output directory (defaults to `./output`) |
| `-s, --server-url <url>` | Base URL applied to all files |
| `-c, --concurrency <n>` | Number of parallel conversions (default: auto-detect CPU cores, max 8) |
| `-A, --apply` | Add the `$apply` (aggregation) query option to all collection endpoints (off by default) |
| `-R, --require-top` | Make `$top` required with a default of `10` (off by default) |
| `-B, --include-batch` | Include the `/$batch` path, skipped by default (off by default) |
| `-r, --recursive` | Search subdirectories for OData files |
| `-O, --overwrite` | Overwrite existing output files |
| `-V, --verbose` | Show detailed step-by-step conversion logs |

**Example:**

```bash
odata-converter batch ./metadata-files -t ./openapi-output --concurrency 4
```

> **Note:** After `npm install -g oasis-odata-openapi`, the command you run is `odata-converter`.

### Get file info

```bash
odata-converter info <input-file>
```

Displays detected OData version, format (XML/JSON), and namespace without converting.

## Web App

The web interface provides drag-and-drop conversion with the same engine:

1. Upload one or more EDMX/CSDL files (or a whole folder)
2. Optionally set a **Server URL**, **Title**, and **Description**
3. Optionally enable the toggles (each mirrors a CLI flag):
   - **Add $apply (aggregation) query option** — same as `-A, --apply`
   - **Require $top (default 10)** — same as `-R, --require-top`
   - **Include the /$batch endpoint** — same as `-B, --include-batch` (skipped by default)
4. Download the converted OpenAPI 3.0 JSON file(s), or a ZIP for multiple files

Each field and toggle has an inline hint in the UI explaining its effect.

## Supported Formats

| Input | OData Version | Format |
| --- | --- | --- |
| `.xml` / `.edmx` | v2, v3, v4 | XML (EDMX) |
| `.json` | v4 | JSON (CSDL) |

## What Gets Added (Post-Processing)

The converter adds SAP Gateway compatibility on top of the standard OData→OpenAPI conversion:

- **HEAD methods** on `/` and `/$metadata` for CSRF token fetching; both HEAD `200` responses declare the `X-CSRF-Token` response header so consumers can see where SAP returns the token
- **PUT methods** mirroring PATCH operations
- **SAP standard parameters**: `sap-client`, `sap-language`, `sap-statistics`, `sap-ds-debug`, `sap-cancel-on-close`
- **x-csrf-token** header on write operations
- **If-Match** header on PUT/PATCH/DELETE operations
- **Relaxed query options**: `$select`/`$expand`/`$orderby` schemas are converted from array+enum to free-form `string`, so nested/wildcard/combined OData values pass strict APIM `validate-parameters` policies
- **Range error responses**: concrete `4xx`/`5xx` error status codes (emitted when the metadata declares `ErrorResponses` capability annotations) are collapsed into the `4XX`/`5XX` ranges, so error responses are expressed uniformly for tooling/portal clarity
- **Optional `$apply`** (`-A`/`--apply`): declares the `$apply` aggregation query option on all collection endpoints so strict APIM policies accept aggregation requests (off by default)
- **Optional required `$top`** (`-R`/`--require-top`): makes `$top` required with a default of `10` on all collection endpoints, guarding against unbounded full-table reads (off by default)
- **Optional `/$batch`** (`-B`/`--include-batch`): the `/$batch` endpoint is skipped by default because batched request contents can't be individually validated by APIM; pass this flag to include it when batch access is deliberately granted
- **Field descriptions**: SAP field captions and tooltips become OpenAPI `title`/`description` for both OData V2 (`sap:label`/`sap:quickinfo`) and V4 (`Common.Label`/`Common.QuickInfo`), which the upstream libraries otherwise drop or mislabel
- **Malformed-XML repair**: SAP production systems sometimes export unescaped `&`, `<`, `>` inside attribute values (e.g. `sap:label="x & y"`), which makes the metadata invalid XML and unconvertible; the converter escapes these stray characters as a pre-parse step so the file can be processed
- **Entity-relationship diagram**: an "Entity Data Model" section with an ER diagram is added to the spec's `info.description` for use in API-catalog documentation
- **Server URL** override (replaces localhost default)

## Third-Party Libraries

This tool uses the following open-source libraries for OData→OpenAPI conversion:

- [`odata-csdl`](https://github.com/oasis-tcs/odata-csdl-schemas) — XML/JSON CSDL parsing
- [`odata-openapi`](https://github.com/oasis-tcs/odata-openapi) — CSDL to OpenAPI 3.0 transformation

These libraries implement the [OASIS OData specification](https://www.oasis-open.org/committees/odata/) conversion rules. Our tool adds SAP-specific post-processing on top.

## Development

### Prerequisites

- Node.js >= 20.0.0

### Setup

```bash
npm install
```

### Run tests

```bash
npm test
```

### Build standalone binary

```bash
npm run build:all
```

### Environment Variables

Copy `.env.build.example` to `.env.build` and fill in your App Insights instrumentation key (optional — telemetry is disabled if not set).

## Telemetry

The tool collects anonymous usage telemetry (file counts, conversion status, duration) to improve the product. No file contents, file names, or personal data are collected. See [TELEMETRY.md](./TELEMETRY.md) for the full schema.

## License

MIT © Microsoft Corporation
