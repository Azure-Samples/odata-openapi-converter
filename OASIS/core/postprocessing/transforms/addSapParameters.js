// +--------------------------------------------------------------
// <copyright file="addSapParameters.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

const { ALL_HTTP_METHODS } = require("../../constants.js");

/**
 * SAP Gateway framework parameters — universal across all SAP OData services.
 * These are handled at the SAP Gateway platform level and are NEVER declared in
 * OData metadata (EDMX). They must be injected during post-processing.
 *
 * @see https://help.sap.com/doc/62ee4e4c1fdc49b3a5885bfe709a80cf/4.3/en-us/38dc089c99d1462faa01126b8ffca06d.html
 */
const SAP_PARAMETERS = Object.freeze([
  {
    name: "sap-client",
    in: "query",
    required: false,
    schema: { type: "string", pattern: "^[0-9]{3}$", example: "100" },
    description:
      "SAP client number (3-digit). Identifies the logical tenant/partition in the SAP system.",
  },
  {
    name: "sap-language",
    in: "query",
    required: false,
    schema: { type: "string", minLength: 2, maxLength: 2, example: "EN" },
    description:
      "Language key (ISO 639-1). Controls language of translatable texts in responses.",
  },
  {
    name: "sap-statistics",
    in: "query",
    required: false,
    schema: { type: "boolean", default: false },
    description:
      "When true, SAP Gateway returns performance statistics in response headers.",
  },
  {
    name: "sap-ds-debug",
    in: "query",
    required: false,
    schema: { type: "boolean", default: false },
    description:
      "Activates SAP Gateway debugging/diagnostics for this request.",
  },
  {
    name: "sap-cancel-on-close",
    in: "query",
    required: false,
    schema: { type: "boolean", default: false },
    description:
      "If true, SAP rolls back the transaction when the HTTP connection is closed before completion.",
  },
  {
    name: "x-csrf-token",
    in: "header",
    required: false,
    schema: { type: "string" },
    description:
      "CSRF token for write operations. Fetch with HEAD request (x-csrf-token: fetch), then include in POST/PUT/PATCH/DELETE.",
  },
]);

/**
 * Adds SAP Gateway standard parameters to the OpenAPI specification.
 * Query parameters are added to ALL operations.
 * x-csrf-token header is added only to write operations.
 * Parameters are registered as reusable components and referenced via $ref.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification with SAP parameters added
 */
function addSapParameters(spec) {
  if (!spec.paths || typeof spec.paths !== "object") {
    return spec;
  }

  // Ensure components.parameters exists
  if (!spec.components) spec.components = {};
  if (!spec.components.parameters) spec.components.parameters = {};

  // Register each SAP parameter as a reusable component
  for (const param of SAP_PARAMETERS) {
    const refName = `sap.${param.name}`;
    spec.components.parameters[refName] = param;
  }

  // Add references to all operations
  for (const pathItem of Object.values(spec.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of ALL_HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      if (!Array.isArray(operation.parameters)) {
        operation.parameters = [];
      }

      // Add query params to ALL operations
      for (const param of SAP_PARAMETERS) {
        if (param.in !== "query") continue;

        const refPath = `#/components/parameters/sap.${param.name}`;
        const alreadyExists = operation.parameters.some(
          (p) => p.name === param.name || (p.$ref && p.$ref === refPath)
        );
        if (!alreadyExists) {
          operation.parameters.push({ $ref: refPath });
        }
      }

      // Add x-csrf-token header only to write operations
      if (["post", "put", "patch", "delete"].includes(method)) {
        const csrfRef = "#/components/parameters/sap.x-csrf-token";
        const hasCsrf = operation.parameters.some(
          (p) =>
            p.name === "x-csrf-token" || (p.$ref && p.$ref === csrfRef)
        );
        if (!hasCsrf) {
          operation.parameters.push({ $ref: csrfRef });
        }
      }
    }
  }

  return spec;
}

module.exports = { addSapParameters, SAP_PARAMETERS };
