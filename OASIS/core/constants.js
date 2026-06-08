// +--------------------------------------------------------------
// <copyright file="constants.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Single source of truth for all OASIS converter constants.
// All consumers (API, CLI, Web App) import from here — no hardcoding.
// ---------------------------------------------------------------

/**
 * Single source of truth for every recognised input format.
 * To accept a new format, just add an entry here — everything else is derived.
 */
const FORMATS = Object.freeze({
  xml:  { ext: ".xml"  },
  edmx: { ext: ".edmx" },
  json: { ext: ".json" },
});

/**
 * Enum-style format identifiers returned by detectFormat().
 */
const FORMAT = Object.freeze(
  Object.fromEntries(
    Object.keys(FORMATS).map((k) => [k.toUpperCase(), k])
  )
);

/**
 * File extensions recognised as valid OData CSDL input.
 */
const SUPPORTED_EXTENSIONS = Object.keys(FORMATS).map((k) => FORMATS[k].ext);

/**
 * Regex that matches supported input extensions (case-insensitive).
 */
const INPUT_EXTENSION_RE = new RegExp(
  `\\.(${Object.keys(FORMATS).join("|")})$`,
  "i"
);

/**
 * Suffix appended to the base filename when generating OpenAPI output.
 */
const OPENAPI_OUTPUT_SUFFIX = "-openapi.json";

/**
 * Maximum allowed file size in bytes (4 MiB).
 * Azure API Management limits OpenAPI spec imports to 4 MiB.
 */
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

/**
 * Human-readable file size limit string for UI display.
 */
const MAX_FILE_SIZE_DISPLAY = "4 MiB";

/**
 * Unicode BOM character (U+FEFF) that some editors prepend to files.
 */
const BOM = "\uFEFF";

/**
 * Maps custom error class names to HTTP status codes for the API layer.
 */
const HTTP_STATUS_MAP = Object.freeze({
  InvalidContentError: 400,
  UnsupportedExtensionError: 400,
  FileTooLargeError: 413,
  XmlParseError: 422,
  JsonParseError: 422,
  CsdlParseError: 422,
  OpenApiConversionError: 422,
  PostProcessingError: 500,
});

/**
 * Stable, machine-readable error codes exposed in API responses.
 * These MUST NOT change across refactors — API consumers depend on them.
 */
const ERROR_CODE = Object.freeze({
  INVALID_CONTENT: "INVALID_CONTENT",
  UNSUPPORTED_EXTENSION: "UNSUPPORTED_EXTENSION",
  MALFORMED_XML: "MALFORMED_XML",
  MALFORMED_JSON: "MALFORMED_JSON",
  INVALID_CSDL: "INVALID_CSDL",
  IO_ERROR: "IO_ERROR",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
});

/**
 * Contextual note shown alongside conversion warnings.
 */
const SDK_WARNING_NOTE =
  "These warnings originate from the underlying OASIS open-source SDK " +
  "(odata-csdl / odata-openapi) due to known limitations in the OData V2 to V4 " +
  "conversion pipeline. Some annotations — such as operation descriptions or " +
  "query-parameter restrictions — may not carry over to the OpenAPI output. " +
  "All API endpoints are still generated; only metadata quality is affected. " +
  "No action is required. Learn more: " +
  "https://github.com/Azure-Samples/odata-openapi-converter#known-limitations";

/**
 * Warning patterns that are suppressed from user-facing output.
 * These are non-actionable annotation resolution warnings from the OASIS SDK.
 */
const SUPPRESSED_WARNING_PATTERNS = Object.freeze([
  /^Invalid annotation target '/,
  /^More than two annotation target path segments$/,
]);

/**
 * App Insights telemetry ingestion endpoint.
 */
const TELEMETRY_INGESTION_URL = "https://dc.services.visualstudio.com/v2/track";

/**
 * App Insights event name for conversion runs.
 */
const TELEMETRY_EVENT_NAME = "OasisRun";

/**
 * Telemetry timeout in milliseconds for CLI (hard ceiling).
 */
const TELEMETRY_TIMEOUT_MS = 3000;

/**
 * Error codes considered internal (5xx) for telemetry scrubbing.
 * Only these include error messages in telemetry payloads.
 */
const INTERNAL_ERROR_CODES = Object.freeze(new Set(["INTERNAL_ERROR", "IO_ERROR"]));

/**
 * CLI exit codes.
 */
const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  ERROR: 1,
});

/**
 * HTTP methods that require write-operation headers (If-Match, CSRF).
 */
const WRITE_METHODS = Object.freeze(["patch", "put", "delete"]);

/**
 * All HTTP methods supported in OpenAPI paths.
 */
const ALL_HTTP_METHODS = Object.freeze(["get", "post", "put", "patch", "delete", "head"]);

module.exports = {
  FORMATS,
  FORMAT,
  SUPPORTED_EXTENSIONS,
  OPENAPI_OUTPUT_SUFFIX,
  INPUT_EXTENSION_RE,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_DISPLAY,
  BOM,
  HTTP_STATUS_MAP,
  ERROR_CODE,
  SDK_WARNING_NOTE,
  SUPPRESSED_WARNING_PATTERNS,
  TELEMETRY_INGESTION_URL,
  TELEMETRY_EVENT_NAME,
  TELEMETRY_TIMEOUT_MS,
  INTERNAL_ERROR_CODES,
  EXIT_CODE,
  WRITE_METHODS,
  ALL_HTTP_METHODS,
};