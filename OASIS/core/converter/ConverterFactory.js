// +--------------------------------------------------------------
// <copyright file="ConverterFactory.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Factory pattern for creating format-specific CSDL parsers.
// New formats can be added by implementing a converter with a convert() method
// and registering it here (Open/Closed Principle).
// ---------------------------------------------------------------

const { FORMAT } = require("../constants.js");
const XmlConverter = require("./XmlConverter.js");
const JsonConverter = require("./JsonConverter.js");

/**
 * Registry mapping format identifiers to their converter strategies.
 * @type {Map<string, { convert: function(string): { csdl: object, messages?: Array } }>}
 */
const converterRegistry = new Map([
  [FORMAT.XML, XmlConverter],
  [FORMAT.EDMX, XmlConverter],
  [FORMAT.JSON, JsonConverter],
]);

/**
 * Factory that creates the appropriate CSDL parser based on detected format.
 *
 * @param {string} format - Format identifier from detectFormat() (e.g. "xml", "json")
 * @returns {{ convert: function(string): { csdl: object, messages?: Array } }} Converter strategy
 * @throws {Error} If format is not registered
 */
function createConverter(format) {
  const converter = converterRegistry.get(format);

  if (!converter) {
    throw new Error(
      `No converter registered for format "${format}". ` +
      `Registered formats: ${[...converterRegistry.keys()].join(", ")}`
    );
  }

  return converter;
}

/**
 * Registers a new converter strategy for a format.
 * Useful for extending with new formats without modifying existing code.
 *
 * @param {string} format - Format identifier
 * @param {{ convert: function }} converter - Converter with a convert(content) method
 */
function registerConverter(format, converter) {
  if (!converter || typeof converter.convert !== "function") {
    throw new Error("Converter must implement a convert(content) method.");
  }
  converterRegistry.set(format, converter);
}

module.exports = { createConverter, registerConverter, converterRegistry };
