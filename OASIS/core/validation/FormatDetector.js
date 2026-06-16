// +--------------------------------------------------------------
// <copyright file="FormatDetector.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Strategy pattern implementation for OData format detection.
// Detects whether content is XML or JSON and validates its basic syntax.
// ---------------------------------------------------------------

const sax = require("sax");
const { BOM, FORMAT } = require("../constants.js");
const {
  InvalidContentError,
  XmlParseError,
  JsonParseError,
} = require("../errors.js");

/**
 * @interface FormatStrategy
 * @method detect(trimmedContent: string): string|null
 * Each strategy returns a FORMAT constant if it matches, or null.
 */

/**
 * Strategy for detecting JSON content.
 * Validates that content starting with { or [ is valid JSON.
 */
const JsonStrategy = {
  /**
   * @param {string} trimmed - Trimmed content string
   * @returns {string|null} FORMAT.JSON if valid JSON, null otherwise
   */
  detect(trimmed) {
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return null;
    }
    try {
      JSON.parse(trimmed);
      return FORMAT.JSON;
    } catch (err) {
      throw new JsonParseError(
        `Content appears to be JSON but is not valid: ${err.message}`,
        err
      );
    }
  },
};

/**
 * Strategy for detecting XML content.
 * Validates that content starting with < is well-formed XML via SAX.
 */
const XmlStrategy = {
  /**
   * @param {string} trimmed - Trimmed content string
   * @returns {string|null} FORMAT.XML if valid XML, null otherwise
   */
  detect(trimmed) {
    if (!trimmed.startsWith("<")) {
      return null;
    }
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
  },
};

/**
 * Runs a SAX parse to validate XML well-formedness.
 *
 * @param {string} xml - Raw XML string
 * @returns {{ message: string, line: number, column: number }|null}
 * @private
 */
function validateXmlSyntax(xml) {
  const parser = sax.parser(true);
  let syntaxError = null;

  parser.onerror = function (err) {
    if (!syntaxError) {
      syntaxError = {
        message: err.message,
        line: parser.line + 1,
        column: parser.column,
      };
    }
    parser.resume();
  };

  try {
    parser.write(xml).close();
  } catch {
    // SAX errors captured in onerror above
  }

  return syntaxError;
}

/**
 * Ordered list of detection strategies.
 * JSON is checked first (faster validation), then XML.
 */
const STRATEGIES = [JsonStrategy, XmlStrategy];

/**
 * Detects content format using the Strategy pattern.
 * Iterates through registered strategies until one matches.
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

  const trimmed = content.replace(BOM, "").trim();

  if (trimmed.length === 0) {
    throw new InvalidContentError("Content is empty.");
  }

  for (const strategy of STRATEGIES) {
    const result = strategy.detect(trimmed);
    if (result !== null) {
      return result;
    }
  }

  const preview = trimmed.length > 30 ? trimmed.substring(0, 30) + "…" : trimmed;
  throw new InvalidContentError(
    `Content does not appear to be XML or JSON. Starts with: "${preview}"`
  );
}

module.exports = {
  detectFormat,
  JsonStrategy,
  XmlStrategy,
  STRATEGIES,
};
