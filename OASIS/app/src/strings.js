// +--------------------------------------------------------------
// <copyright file="strings.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Centralized UI strings for localization readiness.
// All user-facing text lives here. Future i18n: swap this module
// with a locale-aware lookup (e.g., react-intl, i18next, or
// Azure App Configuration-backed resource bundles).
// ---------------------------------------------------------------

export const UI = Object.freeze({
  landing: {
    heading: "SAP ODATA to OpenAPI Converter",
    description:
      "Bridging the gap between OData and OpenAPI. Convert CSDL / EDMX metadata (v2, v3, v4) to fully compliant OpenAPI 3.x specifications that seamlessly integrate as fully functional APIs into Azure API Management.",
    demoAlt: "Demo of OData to OpenAPI conversion",
    consent: "I agree to send non-personal application data.",
    consentLink: "Learn more",
    getStarted: "Get Started",
  },
  convert: {
    heading: "Convert Files",
    description:
      "Upload OData CSDL / EDMX files (.xml, .edmx, .json), individually or as a folder, and convert them to OpenAPI 3.x specifications.",
    skippedAriaLabel: "Unsupported files skipped",
    skippedTitle: (count) => `${count} file${count === 1 ? "" : "s"} skipped:`,
    skippedFooter: "Supported formats: .xml, .edmx, .json (max 4 MiB each).",
    serverUrlLabel: "Server URL (optional)",
    serverUrlHint:
      "The base URL for the generated OpenAPI spec (e.g., https://your-sap-server.com/sap/opu/odata/sap/API_NAME)",
    serverUrlPlaceholder: "https://your-sap-server.com/sap/opu/odata/sap/API_NAME",
    titleLabel: "Title (optional)",
    titleHint:
      "Custom title is how users find this API in the APIM workspace",
    titleMultiFileHint:
      "Title is disabled for multiple files. Each file will use its own namespace as the title.",
    titlePlaceholder: "e.g., Business Partner API",
    descriptionLabel: "Description (optional)",
    descriptionHint:
      "Custom API description shown in the generated spec (info.description). The entity-relationship diagram is still appended after it.",
    descriptionMultiFileHint:
      "Description is disabled for multiple files. Each file will use its own generated description.",
    descriptionPlaceholder: "e.g., Product master data service exposed via SAP OData",
    applyLabel: "Add $apply (aggregation) query option",
    applyHint:
      "Declares the $apply query option on all collection endpoints so strict APIM validate-parameters policies accept aggregation requests. Enable only if your services support aggregation.",
    convertBtn: "Convert",
    convertingBtn: "Converting…",
    resetBtn: "Reset",
    downloadSingle: "Download converted file",
    downloadZip: "Download converted files as ZIP",
    downloadFile: (name) => `Download ${name}`,
    downloadZipLabel: (count) => `Download ZIP (${count} files)`,
    progressLabel: "Conversion progress",
    progressText: (converted, total) => `Converting ${converted} of ${total} files…`,
    filesLoaded: (count) => `Loaded files (${count})`,
    removeFile: (name) => `Remove ${name}`,
    clearAll: "Clear all",
    successful: (count) => `Successful (${count})`,
    failed: (count) => `Failed (${count})`,
    reportIssue: "Report issue",
    issueTitle: (name) => `Conversion error: ${name}`,
    issueBody: (name, error, errorType, code) => `**File:** ${name}\n**Error:** ${error}\n**Error Type:** ${errorType || "Unknown"}\n**Code:** ${code || "N/A"}`,
    warningsAriaLabel: "Conversion warnings",
    warningsIntro:
      "Warnings indicate known limitations in the source metadata and do not affect the converted output.",
    viewWarnings: (count) => `View warnings (${count} file${count === 1 ? "" : "s"})`,
  },
  dropZone: {
    ariaLabel: "Drop files or folders here, or click to browse",
    instruction: "Drag & drop files or folders here, or",
    browse: "browse",
    sizeLimit: "Maximum file size: 4 MiB",
  },
  errors: {
    networkError: "Network error",
    serverError:
      "Internal server error. Please retry after a few minutes. If the issue persists, contact support.",
    fileTooLarge: (name) => `${name} (exceeds 4 MiB limit)`,
    fileTooLargeDetail: (size) => `File size (${size} MiB) exceeds the 4 MiB limit.`,
  },
});
