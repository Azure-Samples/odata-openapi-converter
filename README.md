# OASIS — OData to OpenAPI Converter

[![CI](https://github.com/Azure-Samples/odata-openapi-converter/actions/workflows/ci.yml/badge.svg)](https://github.com/Azure-Samples/odata-openapi-converter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Convert OData CSDL metadata to **OpenAPI 3.0** specifications that integrate as fully functional APIs into Azure API Management.

Available as a **web app**, **CLI**, and **standalone binary**.

---

## Web App

Use the hosted converter — no install required:

**[Launch Web App](https://witty-sand-02a41c00f.1.azurestaticapps.net/)**

Drag and drop one or more OData metadata files (or an entire folder), convert, and download the results as a ZIP.

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

### Quick Start

```bash
# Convert a single file
oasis-converter convert service.xml api.json

# Convert with explicit output flag
oasis-converter convert --output-file api.json service.edmx

# Batch-convert all files in a folder
oasis-converter batch ./input-folder

# Batch-convert recursively with a custom output directory
oasis-converter batch -r --target-dir ./output ./dir1 ./dir2

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
| `-V, --verbose` | Show detailed conversion logs |

### batch options

| Flag | Description |
|------|-------------|
| `-t, --target-dir <path>` | Output directory for converted files |
| `-r, --recursive` | Search subdirectories for OData files |
| `-O, --overwrite` | Overwrite existing output files |
| `-V, --verbose` | Show detailed conversion logs |

Use `oasis-converter <command> --help` for full details on any command.

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
