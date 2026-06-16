// +--------------------------------------------------------------
// <copyright file="XmlConverter.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Strategy for converting XML/EDMX OData CSDL to OpenAPI.
// ---------------------------------------------------------------

const { xml2json } = require("odata-csdl");
const { XmlParseError, CsdlParseError } = require("../errors.js");

/**
 * Converts XML OData CSDL content to a CSDL JSON object.
 *
 * @param {string} content - Raw XML/EDMX string
 * @returns {{ csdl: object, messages: Array }} Parsed CSDL and validation messages
 * @throws {XmlParseError} If XML is malformed
 * @throws {CsdlParseError} If CSDL structure is invalid
 */
function convert(content) {
  const messages = [];

  try {
    const csdl = xml2json(content, { messages });
    return { csdl, messages };
  } catch (err) {
    const msg = err.message || String(err);

    if (
      msg.includes("Invalid character") ||
      msg.includes("Unexpected close tag") ||
      msg.includes("Unclosed root tag") ||
      msg.includes("Text data outside of root node") ||
      msg.includes("Unmatched closing tag") ||
      msg.includes("Invalid attribute name") ||
      msg.includes("No whitespace between attributes")
    ) {
      throw new XmlParseError(msg, err);
    }

    if (msg.includes("Unexpected root element")) {
      throw new CsdlParseError(msg, err, messages);
    }

    if (msg.includes("missing attribute")) {
      throw new CsdlParseError(msg, err, messages);
    }

    throw new CsdlParseError(msg, err, messages);
  }
}

module.exports = { convert };
