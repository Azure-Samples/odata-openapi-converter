// +--------------------------------------------------------------
// <copyright file="helper.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Post-processing pipeline for OpenAPI specification objects.
// All post-processing steps are defined here and executed in sequence
// by the single postProcess() entry point.
// ---------------------------------------------------------------


/**
 * Adds PUT method for all PATCH operations in an OpenAPI specification.
 * For each path that has a PATCH operation but no existing PUT operation,
 * a deep copy of the PATCH operation is created as a PUT operation.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified OpenAPI specification with PUT methods added
 */
function addPutMethods(spec) {
  if (spec.paths && typeof spec.paths === "object") {
    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem || typeof pathItem !== "object") {
        continue;
      }

      if (pathItem.patch && !pathItem.put) {
        try {
          pathItem.put = JSON.parse(JSON.stringify(pathItem.patch));
        } catch (err) {
          throw new Error(`Failed to deep-copy PATCH operation for path "${pathKey}": ${err.message}`);
        }
      }
    }
  }

  return spec;
}

/**
 * Adds HEAD method to the root "/" and "/$metadata" paths.
 * The root HEAD is needed for CSRF token fetching (x-csrf-token: fetch)
 * which SAP OData services require before any write operation.
 * The metadata HEAD allows lightweight availability checks.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified OpenAPI specification with HEAD methods added
 */
function addHeadMethods(spec) {
  if (!spec.paths || typeof spec.paths !== "object") {
    return spec;
  }

  // Ensure the root "/" path exists
  if (!spec.paths["/"]) {
    spec.paths["/"] = {};
  }

  // Add GET to root "/" for service document (required by APIM import)
  if (!spec.paths["/"].get) {
    spec.paths["/"].get = {
      summary: "The root of the API",
      operationId: "root/get",
      responses: {
        "200": {
          description: "The root of the API",
        },
      },
    };
  }

  // Add HEAD to root "/" for CSRF token fetching (only if not already present)
  if (!spec.paths["/"].head) {
    spec.paths["/"].head = {
      summary: "The root of the API, needed for any csrf processing",
      operationId: "root/head",
      responses: {
        "200": {
          description:
            "The root of the API, needed for any csrf processing",
        },
      },
    };
  }

  // Ensure the "/$metadata" path exists
  if (!spec.paths["/$metadata"]) {
    spec.paths["/$metadata"] = {};
  }

  // Add GET to "/$metadata" for metadata endpoint
  if (!spec.paths["/$metadata"].get) {
    spec.paths["/$metadata"].get = {
      summary: "Metadata endpoint",
      operationId: "metadata/get",
      responses: {
        "200": {
          description: "Metadata endpoint",
        },
      },
    };
  }

  // Add HEAD to "/$metadata" for lightweight metadata availability check
  if (!spec.paths["/$metadata"].head) {
    spec.paths["/$metadata"].head = {
      summary: "Metadata availability check",
      operationId: "metadata/head",
      responses: {
        "200": {
          description: "Metadata is available",
        },
      },
    };
  }

  return spec;
}

/**
 * The If-Match header parameter object used for optimistic concurrency control.
 * Added to POST, PATCH, PUT, and DELETE operations so that SAP OData services
 * can enforce ETag-based concurrency checks on write requests.
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

/** HTTP methods that require the If-Match header for optimistic concurrency control. */
const WRITE_METHODS = ["patch", "put", "delete"];

/**
 * Adds the If-Match header parameter to every write operation
 * (PATCH, PUT, DELETE) in the OpenAPI specification.
 * POST is excluded because it creates new entities with no existing ETag.
 * Skips operations that already carry an If-Match header.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified OpenAPI specification with If-Match headers added
 */
function addHeaderParameters(spec) {
  if (!spec.paths || typeof spec.paths !== "object") {
    return spec;
  }

  for (const [, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    for (const method of WRITE_METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }

      // Skip if an If-Match header already exists
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

/**
 * Runs the full post-processing pipeline on an OpenAPI specification.
 * Validates the input, then applies each step in sequence.
 * To add a new step, just call it inside this function.
 *
 * @param {object|string} openApiSpec - OpenAPI spec object (or JSON string)
 * @returns {object} Fully post-processed OpenAPI specification
 * @throws {Error} If spec is null/undefined, not an object, or any step fails
 */
function postProcess(openApiSpec) {
  if (openApiSpec === null || openApiSpec === undefined) {
    throw new Error("OpenAPI spec is null or undefined.");
  }

  let spec;

  if (typeof openApiSpec === "string") {
    try {
      spec = JSON.parse(openApiSpec);
    } catch (err) {
      throw new Error(`Failed to parse OpenAPI spec string as JSON: ${err.message}`);
    }
  } else if (typeof openApiSpec === "object" && !Array.isArray(openApiSpec)) {
    spec = openApiSpec;
  } else {
    throw new Error(`Expected an OpenAPI object or JSON string, received ${typeof openApiSpec}.`);
  }

  // Steps — add new function calls here as needed
  spec = addPutMethods(spec);
  spec = addHeadMethods(spec);
  spec = addHeaderParameters(spec);

  return spec;
}

module.exports = { postProcess };
