// +--------------------------------------------------------------
// <copyright file="addPutMethods.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

/**
 * Adds PUT method for all PATCH operations.
 * For each path with PATCH but no PUT, creates a deep copy as PUT.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification with PUT methods added
 */
function addPutMethods(spec) {
  if (!spec.paths || typeof spec.paths !== "object") {
    return spec;
  }

  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    if (pathItem.patch && !pathItem.put) {
      try {
        pathItem.put = JSON.parse(JSON.stringify(pathItem.patch));
      } catch (err) {
        throw new Error(
          `Failed to deep-copy PATCH operation for path "${pathKey}": ${err.message}`
        );
      }
    }
  }

  return spec;
}

module.exports = { addPutMethods };
