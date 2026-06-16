// +--------------------------------------------------------------
// <copyright file="addIfMatchHeaders.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

const { WRITE_METHODS } = require("../../constants.js");

/**
 * The If-Match header parameter for optimistic concurrency control.
 */
const IF_MATCH_HEADER = Object.freeze({
  name: "If-Match",
  in: "header",
  description: "ETag value",
  required: true,
  schema: { type: "string" },
  "x-ms-visibility": "important",
  "x-ms-summary":
    "Place the eTag value for optimistic concurrency control in this header",
});

/**
 * Adds If-Match header to every write operation (PATCH, PUT, DELETE).
 * POST is excluded because it creates new entities with no existing ETag.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification with If-Match headers added
 */
function addIfMatchHeaders(spec) {
  if (!spec.paths || typeof spec.paths !== "object") {
    return spec;
  }

  for (const [, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of WRITE_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      // Skip if If-Match header already exists
      if (
        Array.isArray(operation.parameters) &&
        operation.parameters.some(
          (p) => p && p.name === "If-Match" && p.in === "header"
        )
      ) {
        continue;
      }

      if (!Array.isArray(operation.parameters)) {
        operation.parameters = [];
      }

      // Deep-copy to avoid shared references between operations
      operation.parameters.push(JSON.parse(JSON.stringify(IF_MATCH_HEADER)));
    }
  }

  return spec;
}

module.exports = { addIfMatchHeaders, IF_MATCH_HEADER };
