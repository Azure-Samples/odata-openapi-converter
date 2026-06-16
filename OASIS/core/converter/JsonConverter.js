// +--------------------------------------------------------------
// <copyright file="JsonConverter.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Strategy for converting JSON OData CSDL to OpenAPI.
// ---------------------------------------------------------------

const { JsonParseError, CsdlParseError } = require("../errors.js");

/**
 * Parses and validates JSON content as a CSDL object.
 *
 * @param {string} content - Raw JSON string
 * @returns {{ csdl: object }} Parsed CSDL object
 * @throws {JsonParseError} If JSON syntax is invalid
 * @throws {CsdlParseError} If parsed JSON is not a valid CSDL structure
 */
function convert(content) {
  let csdl;

  try {
    csdl = JSON.parse(content);
  } catch (err) {
    throw new JsonParseError(err.message, err);
  }

  if (csdl === null || typeof csdl !== "object" || Array.isArray(csdl)) {
    throw new CsdlParseError(
      "Parsed JSON is not a valid CSDL object. Expected a JSON object with schema namespaces."
    );
  }

  return { csdl };
}

module.exports = { convert };
