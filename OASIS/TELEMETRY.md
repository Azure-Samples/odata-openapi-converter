# OASIS Telemetry Schema Reference

This document is the single source of truth for the telemetry emitted by the OASIS converter.

## Overview

All telemetry is sent to Azure Application Insights as a custom event named **`OasisRun`**.

- **CLI** uses `core/telemetry/TelemetryClient` with Node.js HTTPS transport
- **Web App** uses `core/telemetry/TelemetryClient` with browser Fetch transport
- Both surfaces share the same schema logic in `core/telemetry/schemas.js`

## Event Schema

| Property | Type | Description | Source |
|----------|------|-------------|--------|
| `ts` | ISO 8601 string | Timestamp when the event was generated | Both |
| `sv` | string | Schema version (currently `"1"`) — for forward-compatible dashboards | Both |
| `dc` | string | Data classification (`"SystemMetadata"`) — Microsoft compliance tag | Both |
| `rid` | string (12-char) | Run ID — unique per conversion batch | Both |
| `uid` | string (12-char) | Pseudonymous client ID. CLI: per-user UUID from `~/.oasis/uid`. Web: localStorage UUID. | Both |
| `src` | `"cli"` \| `"web"` | Which surface generated this event | Both |
| `tot` | string (number) | Total files processed in this run | Both |
| `ok` | string (number) | Successful conversions | Both |
| `fail` | string (number) | Failed conversions | Both |
| `warn` | string (number) | Files that produced warnings | Both |
| `st` | string | Overall status: `"ok"`, `"partial"`, `"fail"`, `"skipped"` | Both |
| `ms` | string (number) | Wall-clock duration in milliseconds | Both |
| `dl` | `"0"` \| `"1"` | Whether the user downloaded the result (web only) | Web |
| `odata` | string | OData version detected: `"v2"`, `"v4"`, `"unknown"` | Both |
| `apiType` | string | Primary CSDL schema namespace (API identifier) | Both |
| `errors` | JSON string | Array of `[{type, error?}]` — error codes for failures | Both |
| `skipped` | string (number) | Count of skipped files | Both |
| `skipRsn` | string | Reason code for skipped files (e.g. `"UNSUPPORTED_EXTENSION"`) | Both |

## Status Values (`st`)

| Value | Meaning |
|-------|---------|
| `ok` | All files converted successfully (`fail == 0`) |
| `partial` | Some files succeeded, some failed (`ok > 0 && fail > 0`) |
| `fail` | All files failed (`ok == 0 && fail > 0`) |
| `skipped` | Files were skipped (e.g. unsupported extension) |

## Error Codes (`errors[].type`)

| Code | Description | Includes message? |
|------|-------------|:-:|
| `INVALID_CONTENT` | Empty or unrecognizable file content | No |
| `UNSUPPORTED_EXTENSION` | File extension not in `.xml`, `.edmx`, `.json` | No |
| `MALFORMED_XML` | XML syntax error | No |
| `MALFORMED_JSON` | JSON syntax error | No |
| `INVALID_CSDL` | Valid XML/JSON but not valid OData CSDL | No |
| `IO_ERROR` | File system read/write failure | Yes (scrubbed) |
| `FILE_TOO_LARGE` | File exceeds 4 MiB limit | No |
| `INTERNAL_ERROR` | Unexpected error in conversion pipeline | Yes (scrubbed) |
| `NETWORK_ERROR` | HTTP request failed (web only) | No |

> Only `IO_ERROR` and `INTERNAL_ERROR` include a scrubbed error message in telemetry. All file paths are replaced with `<path>` before sending.

## Skip Reasons (`skipRsn`)

| Value | Description |
|-------|-------------|
| `UNSUPPORTED_EXTENSION` | File extension not recognized |
| `FILE_NOT_FOUND` | Input file does not exist |
| `NOT_A_FILE` | Path is a directory, not a file |
| `DIR_NOT_FOUND` | Input directory does not exist |
| `NOT_A_DIR` | Path is a file, not a directory |
| `NO_FILES_FOUND` | No supported files found in directory |

## Privacy

### What we collect
- Anonymous usage metrics only
- Pseudonymous client ID (random hash, not linked to identity)
- Machine-readable error codes
- Scrubbed error messages (file paths removed) for internal errors only

### What we do NOT collect
- File paths, file names, or file contents
- IP addresses or personally identifiable information
- OData metadata or OpenAPI output
- User credentials or authentication tokens

## Dashboard

The telemetry powers an Azure Monitor Workbook (`oasis-dashboard.workbook`) with these panels:

1. **Unique Users per Day** — by source (web/cli)
2. **Files Converted per Day** — succeeded/failed/total
3. **Batch vs Single File** — conversions with `tot > 1` vs `tot == 1`
4. **P50 / P99 Latency** — conversion duration percentiles
5. **Succeeded vs Failed Runs** — by status
6. **Error Code Count** — error type distribution
7. **OData Version Distribution** — v2 vs v4 adoption
8. **Download Rate** — % of web runs that download results
9. **Skipped Files & Reasons** — skip volume and cause
10. **Top API Types** — most frequently converted API namespaces

## KQL Quick Reference

```kql
// All conversion events
customEvents | where name == "OasisRun"

// Extend properties for querying
| extend p = customDimensions
| extend src = tostring(p.src), st = tostring(p.st),
        tot = toint(p.tot), ms = todouble(p.ms),
        odata = tostring(p.odata), apiType = tostring(p.apiType)

// Daily usage by source
| summarize runs = count() by bin(timestamp, 1d), src

// Error breakdown
| where isnotempty(tostring(p.errors))
| mv-expand err = todynamic(tostring(p.errors))
| extend ErrorType = tostring(err["type"])
| summarize count() by ErrorType
```

## Implementation Files

| File | Role |
|------|------|
| `core/telemetry/TelemetryClient.js` | Client with pluggable transport (strategy pattern) |
| `core/telemetry/schemas.js` | Event payload construction (shared between CLI & web) |
| `core/telemetry/transports.js` | Transport implementations (Node.js HTTPS + browser Fetch) |
| `core/telemetry/scrubber.js` | Path/PII scrubbing utility |
| `core/constants.js` | `TELEMETRY_INGESTION_URL`, `TELEMETRY_EVENT_NAME`, `TELEMETRY_TIMEOUT_MS` |
| `app/src/telemetry.js` | Browser adapter (thin wrapper around TelemetryClient) |
| `cli/cli.js` | CLI telemetry initialization |
