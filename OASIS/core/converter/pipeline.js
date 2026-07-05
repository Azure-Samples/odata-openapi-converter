// +--------------------------------------------------------------
// <copyright file="pipeline.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Conversion pipeline orchestrating the full flow:
// detect format → parse CSDL → convert to OpenAPI → post-process.
// This is the single entry point for all consumers (API, CLI, Web).
// ---------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { csdl2openapi } = require("odata-openapi");

const { OPENAPI_OUTPUT_SUFFIX, INPUT_EXTENSION_RE, SUPPRESSED_WARNING_PATTERNS } = require("../constants.js");
const { OpenApiConversionError, PostProcessingError, FileIOError } = require("../errors.js");
const { detectFormat, validateExtension, isSupportedFile } = require("../validation/index.js");
const { createConverter } = require("./ConverterFactory.js");
const { postProcess } = require("../postprocessing/index.js");

/**
 * Extracts the API type/name from the parsed CSDL JSON.
 * In OData CSDL JSON, schema namespaces are top-level keys (not prefixed with $).
 * E.g., "API_BUSINESS_PARTNER" or "com.sap.gateway.srvd_a2x.api_businesspartner"
 *
 * @param {object} csdl - Parsed CSDL JSON object
 * @returns {string} The primary schema namespace, or "unknown"
 */
function extractApiType(csdl) {
  if (!csdl || typeof csdl !== "object") return "unknown";
  const namespaces = Object.keys(csdl).filter((k) => !k.startsWith("$"));
  return namespaces.length > 0 ? namespaces[0] : "unknown";
}

/**
 * Converts OData CSDL content (XML or JSON string) to an OpenAPI specification.
 * This is the core conversion function — stateless, no I/O, no side effects.
 *
 * @param {string} content - OData CSDL content (XML or JSON string)
 * @param {object} [options={}] - Conversion options passed to odata-openapi
 * @param {function} [log] - Optional logger callback. No-op when omitted.
 * @returns {{ openapi: object, warnings: string[] }} OpenAPI spec and warnings
 * @throws {InvalidContentError|XmlParseError|JsonParseError|CsdlParseError|OpenApiConversionError|PostProcessingError}
 */
function convertContent(content, options = {}, log = () => {}) {
  // Stage 1: Detect format
  log("Detecting content format...");
  const format = detectFormat(content);
  log(`  Format detected: ${format}`);

  // Stage 2: Parse content into CSDL using appropriate strategy
  log(`Parsing ${format.toUpperCase()} to CSDL...`);
  const converter = createConverter(format);
  const parseResult = converter.convert(content);
  const csdl = parseResult.csdl;
  const csdlWarnings = (parseResult.messages || []).map(
    (msg) => (typeof msg === "string" ? msg : msg.message || String(msg))
  );
  log("  Parsed successfully.");

  // Stage 3: Convert CSDL to OpenAPI
  log("Converting CSDL to OpenAPI 3.0...");
  let openapi;
  const openapiMessages = [];

  try {
    openapi = csdl2openapi(csdl, { ...options, messages: openapiMessages });
  } catch (err) {
    log("  ✗ OpenAPI conversion failed.");
    const userMessage =
      "This file contains OData constructs that the conversion library cannot process. " +
      "This is a known limitation for certain function imports or type references.";
    throw new OpenApiConversionError(userMessage, err, openapiMessages);
  }

  if (!openapi || typeof openapi !== "object") {
    throw new OpenApiConversionError(
      "csdl2openapi returned an invalid result.",
      null,
      openapiMessages
    );
  }

  if (!openapi.openapi || !openapi.info) {
    throw new OpenApiConversionError(
      "csdl2openapi output is missing required OpenAPI fields (openapi, info).",
      null,
      openapiMessages
    );
  }
  log("  OpenAPI conversion succeeded.");

  // Stage 4: Post-processing
  log("Compiling final output...");
  try {
    openapi = postProcess(openapi, { includeApply: options.includeApply });
  } catch (err) {
    log("  ✗ Failed to compile final output.");
    throw new PostProcessingError(err.message, err);
  }
  log("  Final output compiled successfully.");

  // Filter non-actionable warnings
  const warnings = [...csdlWarnings, ...openapiMessages].filter(
    (msg) => !SUPPRESSED_WARNING_PATTERNS.some((pattern) => pattern.test(msg))
  );

  // Extract schema namespace(s) as API type identifier
  const apiType = extractApiType(csdl);

  return { openapi, warnings, apiType };
}

/**
 * Ensures that the directory for the given file path exists.
 * @param {string} filePath - Full path to a file
 * @private
 */
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Converts a single OData CSDL file to OpenAPI format and writes the output.
 *
 * @param {string} inputPath - Full path to the input file
 * @param {string} outputPath - Full path to the output file
 * @param {object} [options={}] - Conversion options
 * @param {function} [log] - Optional logger callback
 * @returns {{ outputPath: string, warnings: string[] }}
 * @throws {UnsupportedExtensionError|FileIOError|...}
 */
function convertFile(inputPath, outputPath, options = {}, log = () => {}) {
  if (!fs.existsSync(inputPath)) {
    throw new FileIOError(
      `Input file not found: ${inputPath}`,
      Object.assign(new Error(`ENOENT: no such file or directory '${inputPath}'`), { code: "ENOENT" })
    );
  }

  log(`Validating file extension: ${path.extname(inputPath)}`);
  validateExtension(inputPath);

  log(`Reading file: ${inputPath}`);
  let text;
  try {
    text = fs.readFileSync(inputPath, "utf8");
  } catch (err) {
    throw new FileIOError(`Failed to read input file: ${inputPath}`, err);
  }
  log(`  Read ${text.length} characters.`);

  const { openapi, warnings } = convertContent(text, options, log);

  log(`Writing output: ${outputPath}`);
  try {
    ensureDirectoryExists(outputPath);
    fs.writeFileSync(outputPath, JSON.stringify(openapi, null, 2), "utf8");
  } catch (err) {
    throw new FileIOError(`Failed to write output file: ${outputPath}`, err);
  }
  log("  Output written successfully.");

  return { outputPath, warnings };
}

/**
 * Processes all supported OData files in a folder.
 *
 * @param {string} inputFolder - Input folder path
 * @param {string} outputFolder - Output folder path
 * @param {object} [options={}] - Conversion options
 * @param {function} [log] - Optional logger callback
 * @param {function} [onFileComplete] - Called after each file
 * @returns {object} Summary with total, successful, failed counts and results
 */
function convertFolder(inputFolder, outputFolder, options = {}, log = () => {}, onFileComplete = () => {}) {
  if (!fs.existsSync(inputFolder)) {
    throw new Error(`Input folder not found: ${inputFolder}`);
  }

  const files = fs.readdirSync(inputFolder);
  const odataFiles = files.filter(isSupportedFile);
  log(`Found ${odataFiles.length} supported file(s) out of ${files.length} total.`);

  if (odataFiles.length === 0) {
    return { total: 0, successful: 0, failed: 0, results: [] };
  }

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const results = [];

  odataFiles.forEach((file) => {
    try {
      const inputPath = path.join(inputFolder, file);
      const outputFileName = file.replace(INPUT_EXTENSION_RE, OPENAPI_OUTPUT_SUFFIX);
      const outputPath = path.join(outputFolder, outputFileName);

      const { outputPath: out, warnings } = convertFile(inputPath, outputPath, options, log);
      const result = { file, success: true, outputPath: out, warnings };
      results.push(result);
      onFileComplete(result, results.length, odataFiles.length);
    } catch (error) {
      const result = { file, success: false, error: error.message, errorType: error.name, code: error.code };
      results.push(result);
      onFileComplete(result, results.length, odataFiles.length);
    }
  });

  return {
    total: odataFiles.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

module.exports = {
  convertContent,
  convertFile,
  convertFolder,
  extractApiType,
};
