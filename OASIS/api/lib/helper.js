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

  return spec;
}

module.exports = { postProcess };
