# OASIS — OData to OpenAPI Converter

Convert OData CSDL/EDMX metadata (v2, v3, v4) to fully compliant OpenAPI 3.0 specifications.

## Features

- Converts XML (EDMX) and JSON (CSDL) OData metadata to OpenAPI 3.0
- Supports OData v2, v3, and v4
- Adds SAP-specific parameters (sap-client, sap-language, x-csrf-token, etc.)
- Adds HEAD methods for CSRF token fetching
- Configurable server URL and API title
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
oasis-odata-openapi convert <input-file> [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--server-url <url>` | Base URL for the generated OpenAPI spec (e.g., `https://your-server.com/sap/opu/odata/sap/API_NAME`) |
| `--title <title>` | Custom title for `openapi.info.title` |
| `-o, --output <path>` | Output file path (defaults to `<input>.openapi.json`) |

**Example:**

```bash
oasis-odata-openapi convert metadata.xml --server-url https://myserver.com/sap/opu/odata/sap/API_SALES_ORDER --title "Sales Order API"
```

### Batch convert a folder

```bash
oasis-odata-openapi batch <input-folder> [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--server-url <url>` | Base URL applied to all files |
| `--title <title>` | Custom title applied to all files |
| `-o, --output <path>` | Output directory (defaults to `./output`) |
| `--concurrency <n>` | Number of parallel conversions (default: auto-detect CPU cores, max 8) |

**Example:**

```bash
oasis-odata-openapi batch ./metadata-files -o ./openapi-output --concurrency 4
```

### Get file info

```bash
oasis-odata-openapi info <input-file>
```

Displays detected OData version, format (XML/JSON), and namespace without converting.

## Web App

The web interface provides drag-and-drop conversion with the same engine:

1. Upload one or more EDMX/CSDL files
2. Optionally set a server URL and title
3. Download converted OpenAPI 3.0 JSON files

## Supported Formats

| Input | OData Version | Format |
| --- | --- | --- |
| `.xml` / `.edmx` | v2, v3, v4 | XML (EDMX) |
| `.json` | v4 | JSON (CSDL) |

## What Gets Added (Post-Processing)

The converter adds SAP Gateway compatibility on top of the standard OData→OpenAPI conversion:

- **HEAD methods** on `/` and `/$metadata` for CSRF token fetching
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
