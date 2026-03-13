// +--------------------------------------------------------------
// <copyright file="constants.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Shared constants for the OASIS converter pipeline.
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
 * e.g. FORMAT.XML === "xml", FORMAT.JSON === "json"
 */
const FORMAT = Object.freeze(
  Object.fromEntries(
    Object.keys(FORMATS).map((k) => [k.toUpperCase(), k])
  )
);

/**
 * File extensions recognised as valid OData CSDL input.
 * Derived from FORMATS — no manual sync needed.
 */
const SUPPORTED_EXTENSIONS = Object.keys(FORMATS).map((k) => FORMATS[k].ext);

/**
 * Regex that matches supported input extensions (case-insensitive).
 * Derived from FORMATS — no manual sync needed.
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
 */
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

/**
 * Unicode BOM character (U+FEFF) that some editors prepend to files.
 */
const BOM = "\uFEFF";

/**
 * Maps custom error class names to HTTP status codes for the API layer.
 * Add new error → status mappings here as needed.
 */
const HTTP_STATUS_MAP = Object.freeze({
  InvalidContentError: 400,
  UnsupportedExtensionError: 400,
  FileTooLargeError: 413,
  XmlParseError: 422,
  JsonParseError: 422,
  CsdlParseError: 422,
  OpenApiConversionError: 500,
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
});

/**
 * Contextual note shown alongside conversion warnings.
 * Explains that warnings originate from the underlying OASIS open-source SDK
 * (odata-csdl / odata-openapi), not from this tool.
 */
const SDK_WARNING_NOTE =
  "These warnings originate from the underlying OASIS open-source SDK " +
  "(odata-csdl / odata-openapi) due to known limitations in the OData V2 to V4 " +
  "conversion pipeline. Some annotations — such as operation descriptions or " +
  "query-parameter restrictions — may not carry over to the OpenAPI output. " +
  "All API endpoints are still generated; only metadata quality is affected. " +
  "No action is required. Learn more: " +
  "https://github.com/thanmayee75/odata-openapi-converter#known-limitations";

module.exports = {
  FORMATS,
  FORMAT,
  SUPPORTED_EXTENSIONS,
  OPENAPI_OUTPUT_SUFFIX,
  INPUT_EXTENSION_RE,
  MAX_FILE_SIZE_BYTES,
  BOM,
  HTTP_STATUS_MAP,
  ERROR_CODE,
  SDK_WARNING_NOTE,
};
