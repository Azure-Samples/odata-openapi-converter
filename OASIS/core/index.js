// +--------------------------------------------------------------
// <copyright file="index.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Public API facade for the OASIS core engine.
// All consumers (API, CLI, Web) import from this single entry point.
// ---------------------------------------------------------------

const { convertContent, convertFile, convertFolder, extractApiType } = require("./converter/pipeline.js");
const { createConverter, registerConverter } = require("./converter/ConverterFactory.js");
const { PostProcessorBuilder, postProcess } = require("./postprocessing/index.js");
const { detectFormat, isSupportedFile, validateExtension, validateFileSize } = require("./validation/index.js");
const { TelemetryClient, nodeHttpsTransport, fetchTransport, scrubPaths, TELEMETRY_FIELDS } = require("./telemetry/index.js");
const { Logger } = require("./logging/index.js");
const constants = require("./constants.js");
const errors = require("./errors.js");
const { STRINGS } = require("./strings.js");

module.exports = {
  // Converter pipeline
  convertContent,
  convertFile,
  convertFolder,
  extractApiType,

  // Factory (extensibility)
  createConverter,
  registerConverter,

  // Post-processing
  PostProcessorBuilder,
  postProcess,

  // Validation
  detectFormat,
  isSupportedFile,
  validateExtension,
  validateFileSize,

  // Telemetry
  TelemetryClient,
  nodeHttpsTransport,
  fetchTransport,
  scrubPaths,
  TELEMETRY_FIELDS,

  // Logging
  Logger,

  // Constants & Errors (namespaced)
  constants,
  errors,
  STRINGS,

  // Re-export commonly used constants at top level for convenience
  ...constants,
  ...errors,
};
