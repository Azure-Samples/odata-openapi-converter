// +--------------------------------------------------------------
// <copyright file="strings.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Centralized user-facing strings for localization readiness.
// All human-readable messages live here. Machine-readable codes (ERROR_CODE)
// stay in constants.js and are NEVER localized.
//
// Future i18n: Replace this module with a locale-aware lookup function
// (e.g., load strings from Azure App Configuration or resource bundles).
// ---------------------------------------------------------------

const STRINGS = Object.freeze({
  errors: {
    MISSING_BODY_FIELDS: "Request body must include 'fileName' and 'content'.",
    INVALID_SERVER_URL: "Invalid serverUrl. Must be a valid URL (e.g., https://your-server.com/sap/opu/odata/sap/API_NAME).",
    INTERNAL_ERROR: "Internal server error. Please retry after a few minutes. If the issue persists, contact support.",
  },
  cli: {
    NO_FILES_FOUND: "No supported OData files found in the specified directories.",
    INVALID_SERVER_URL: "Error: Invalid --server-url. Must be a valid URL (e.g., https://your-server.com/sap/opu/odata/sap/).",
    DIR_NOT_FOUND: "Error: Input directory not found:",
    NOT_A_DIR: "Error: Not a directory:",
    NOT_A_DIR_HINT: 'Hint: Use "oasis-converter convert" to convert a single file.',
    FILE_NOT_FOUND: "Error: Input file not found:",
    OVERWRITE_HINT: "output exists, use -O to overwrite",
  },
  warnings: {
    SDK_NOTE_PREFIX: "These warnings originate from the underlying OASIS open-source SDK",
  },
});

module.exports = { STRINGS };
