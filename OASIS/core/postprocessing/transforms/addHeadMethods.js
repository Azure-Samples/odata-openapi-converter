// +--------------------------------------------------------------
// <copyright file="addHeadMethods.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

/**
 * Adds HEAD method to root "/" and "/$metadata" paths.
 * Root HEAD is needed for CSRF token fetching (SAP OData services).
 * Metadata HEAD allows lightweight availability checks.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification with HEAD methods added
 */
function addHeadMethods(spec) {
  if (!spec.paths || typeof spec.paths !== "object") {
    return spec;
  }

  // Ensure root "/" path exists with GET and HEAD
  if (!spec.paths["/"]) {
    spec.paths["/"] = {};
  }

  if (!spec.paths["/"].get) {
    spec.paths["/"].get = {
      summary: "The root of the API",
      operationId: "root/get",
      responses: {
        "200": { description: "The root of the API" },
      },
    };
  }

  if (!spec.paths["/"].head) {
    spec.paths["/"].head = {
      summary: "The root of the API, needed for any csrf processing",
      operationId: "root/head",
      responses: {
        "200": {
          description: "The root of the API, needed for any csrf processing",
        },
      },
    };
  }

  // Ensure "/$metadata" path exists with GET and HEAD
  if (!spec.paths["/$metadata"]) {
    spec.paths["/$metadata"] = {};
  }

  if (!spec.paths["/$metadata"].get) {
    spec.paths["/$metadata"].get = {
      summary: "Metadata endpoint",
      operationId: "metadata/get",
      responses: {
        "200": { description: "Metadata endpoint" },
      },
    };
  }

  if (!spec.paths["/$metadata"].head) {
    spec.paths["/$metadata"].head = {
      summary: "Metadata availability check",
      operationId: "metadata/head",
      responses: {
        "200": { description: "Metadata is available" },
      },
    };
  }

  return spec;
}

module.exports = { addHeadMethods };
