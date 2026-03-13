// +--------------------------------------------------------------
// <copyright file="validation.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Input validation and parsing helpers for the OASIS
// converter pipeline. Handles format detection, extension checks,
// XML parsing, and JSON parsing with structured error reporting.
// ---------------------------------------------------------------

const path = require("path");
const sax = require("sax");
const { xml2json } = require("odata-csdl");

const { SUPPORTED_EXTENSIONS, BOM, FORMAT } = require("./constants.js");
const {
  UnsupportedExtensionError,
  InvalidContentError,
  XmlParseError,
  JsonParseError,
  CsdlParseError,
} = require("./errors.js");

/**
 * Runs a quick SAX parse to validate XML well-formedness.
 * Returns null if the XML is well-formed, or an object with
 * message/line/column info if a syntax error is found.
 *
 * Uses strict mode so all XML violations are caught:
 * unclosed tags, mismatched tags, bad attributes, encoding issues, etc.
 *
 * @param {string} xml - Raw XML string
 * @returns {{ message: string, line: number, column: number }|null} Error info or null if valid
 * @private
 */
function validateXmlSyntax(xml) {
  const parser = sax.parser(true);
  let syntaxError = null;

  parser.onerror = function (err) {
    if (!syntaxError) {
      syntaxError = {
        message: err.message,
        line: parser.line + 1, // sax lines are 0-based
        column: parser.column,
      };
    }
    parser.resume();
  };

  try {
    parser.write(xml).close();
  } catch (_) {
    // Some SAX errors may still throw despite resume;
    // we already captured the error in onerror above.
  }

  return syntaxError;
}

/**
 * Detects content format by properly validating the structure.
 *
 * For JSON: attempts a full JSON.parse to confirm syntactic validity.
 *
 * For XML: runs the content through a SAX parser in strict mode to
 * validate well-formedness. This catches all XML syntax errors including
 * unclosed tags, mismatched tags, invalid characters, bad attribute
 * syntax, missing quotes, encoding issues, etc.
 *
 * @param {string} content - Raw file content
 * @returns {"xml"|"json"} Detected format
 * @throws {InvalidContentError} If content is null, empty, or unrecognizable
 * @throws {JsonParseError} If content looks like JSON but fails to parse
 * @throws {XmlParseError} If content looks like XML but is malformed
 */
function detectFormat(content) {
  if (content === null || content === undefined) {
    throw new InvalidContentError("Content is null or undefined.");
  }

  if (typeof content !== "string") {
    throw new InvalidContentError(
      `Expected string content, received ${typeof content}.`
    );
  }

  // Strip BOM and whitespace
  const trimmed = content.replace(BOM, "").trim();

  if (trimmed.length === 0) {
    throw new InvalidContentError("Content is empty.");
  }

  // JSON detection
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return FORMAT.JSON;
    } catch (err) {
      throw new JsonParseError(
        `Content appears to be JSON but is not valid: ${err.message}`,
        err
      );
    }
  }

  // XML detection
  if (trimmed.startsWith("<")) {
    try {
      const xmlErr = validateXmlSyntax(trimmed);

      if (xmlErr) {
        const detail = xmlErr.message.replace(/\n/g, " ").trim();
        throw new XmlParseError(
          `${detail} (line ${xmlErr.line}, column ${xmlErr.column})`,
          xmlErr
        );
      }

      return FORMAT.XML;
    } catch (err) {
      if (err instanceof XmlParseError) throw err;
      throw new XmlParseError(
        `XML validation failed unexpectedly: ${err.message}`,
        err
      );
    }
  }

  // Unrecognizable
  const preview = trimmed.length > 30 ? trimmed.substring(0, 30) + "…" : trimmed;

  throw new InvalidContentError(
    `Content does not appear to be XML or JSON. Starts with: "${preview}"`
  );
}

// Extension Validation

/**
 * Checks whether a filename has a supported OData extension.
 *
 * @param {string} fileName - Name of the file to check
 * @returns {boolean} True if the file has a supported extension
 */
function isSupportedFile(fileName) {
  if (typeof fileName !== "string" || fileName.trim() === "") return false;
  const ext = path.extname(fileName).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Validates the file extension and throws if unsupported.
 *
 * @param {string} fileName - Name or path of the file
 * @throws {UnsupportedExtensionError} If the extension is not supported
 */
function validateExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();

  if (!ext) {
    throw new UnsupportedExtensionError("(no extension)");
  }

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new UnsupportedExtensionError(ext);
  }
}

// Content Parsing

/**
 * Parses and validates XML content using odata-csdl's xml2json.
 * Collects validation messages and throws structured errors
 * for malformed XML or CSDL structural issues.
 *
 * @param {string} content - Raw XML string
 * @returns {{ csdl: object, messages: Array }} Parsed CSDL object and validation messages
 * @throws {XmlParseError} If XML is malformed (SAX-level errors)
 * @throws {CsdlParseError} If CSDL structure is invalid (unexpected root, missing attrs)
 */
function parseXml(content) {
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

    // Unexpected root element (not <edmx:Edmx>)
    if (msg.includes("Unexpected root element")) {
      throw new CsdlParseError(msg, err, messages);
    }

    // Missing required CSDL attribute (Version, Namespace, etc.)
    if (msg.includes("missing attribute")) {
      throw new CsdlParseError(msg, err, messages);
    }

    // Any other xml2json error — treat as CSDL structural failure
    throw new CsdlParseError(msg, err, messages);
  }
}

/**
 * Parses and validates JSON content as a CSDL object.
 *
 * @param {string} content - Raw JSON string
 * @returns {{ csdl: object }} Parsed CSDL object
 * @throws {JsonParseError} If JSON syntax is invalid
 * @throws {CsdlParseError} If parsed JSON is not a valid CSDL structure
 */
function parseJson(content) {
  let csdl;

  try {
    csdl = JSON.parse(content);
  } catch (err) {
    throw new JsonParseError(err.message, err);
  }

  // CSDL JSON must be a plain object (not null, not an array)
  if (csdl === null || typeof csdl !== "object" || Array.isArray(csdl)) {
    throw new CsdlParseError(
      "Parsed JSON is not a valid CSDL object. Expected a JSON object with schema namespaces."
    );
  }

  return { csdl };
}

module.exports = {
  detectFormat,
  isSupportedFile,
  validateExtension,
  parseXml,
  parseJson,
};
