// +--------------------------------------------------------------
// <copyright file="converter.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Core converter module for the oasis-odata-openapi package.
// Provides functions to convert OData CSDL specifications (XML/JSON)
// to OpenAPI 3.0 format, supporting both single-file and batch modes.
// ---------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { csdl2openapi } = require("odata-openapi");

const { postProcess } = require("./helper.js");
const { OPENAPI_OUTPUT_SUFFIX, INPUT_EXTENSION_RE, FORMAT } = require("./constants.js");
const {
  OpenApiConversionError,
  PostProcessingError,
  FileIOError,
} = require("./errors.js");
const {
  detectFormat,
  isSupportedFile,
  validateExtension,
  parseXml,
  parseJson,
} = require("./validation.js");

/**
 * Converts OData CSDL content (XML or JSON string) to an OpenAPI specification object.
 * Performs full validation with structured error handling at each stage.
 *
 * @param {string} content - OData CSDL content (XML or JSON string)
 * @param {object} options - Conversion options passed to odata-openapi
 * @param {function} [log] - Optional logger callback (e.g. console.log). No-op when omitted.
 * @returns {{ openapi: object, warnings: string[] }} OpenAPI spec and any non-fatal warnings
 * @throws {InvalidContentError} If content is empty or unrecognizable
 * @throws {XmlParseError} If XML is malformed
 * @throws {JsonParseError} If JSON is malformed
 * @throws {CsdlParseError} If CSDL structure is invalid
 * @throws {OpenApiConversionError} If csdl2openapi conversion fails
 * @throws {PostProcessingError} If addPutMethods post-processing fails
 */
function convertContent(content, options = {}, log = () => {}) {
  // Stage 1: Detect format
  log("Detecting content format...");
  const format = detectFormat(content);
  log(`  Format detected: ${format}`);

  // Stage 2: Parse content into CSDL
  let csdl;
  const csdlWarnings = [];

  if (format === FORMAT.XML || format === FORMAT.EDMX) {
    log("Parsing XML to CSDL JSON...");
    const result = parseXml(content);
    csdl = result.csdl;
    log("  XML parsed successfully.");

    // Collect xml2json validation messages as warnings
    for (const msg of result.messages) {
      csdlWarnings.push(
        typeof msg === "string" ? msg : msg.message || String(msg)
      );
    }
  } else {
    log("Parsing JSON CSDL...");
    const result = parseJson(content);
    csdl = result.csdl;
    log("  JSON parsed successfully.");
  }

  // Stage 3: Convert CSDL to OpenAPI
  log("Converting CSDL to OpenAPI 3.0...");
  let openapi;
  const openapiMessages = [];

  try {
    openapi = csdl2openapi(csdl, { ...options, messages: openapiMessages });
  } catch (err) {
    log("  ✗ OpenAPI conversion failed.");
    throw new OpenApiConversionError(err.message, err, openapiMessages);
  }

  // Validate that csdl2openapi produced a valid OpenAPI object
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
    openapi = postProcess(openapi);
  } catch (err) {
    log("  ✗ Failed to compile final output.");
    throw new PostProcessingError(err.message, err);
  }
  log("  Final output compiled successfully.");

  // Combine all warnings
  const warnings = [...csdlWarnings, ...openapiMessages];

  return { openapi, warnings };
}

/**
 * Ensures that the directory for the given file path exists,
 * creating it recursively if necessary.
 *
 * @param {string} filePath - Full path to a file
 * @returns {void}
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
 * @param {string} inputPath - Full path to the input file (XML or JSON)
 * @param {string} outputPath - Full path to the output file (OpenAPI JSON)
 * @param {object} options - Conversion options passed to odata-openapi
 * @param {function} [log] - Optional logger callback (e.g. console.log). No-op when omitted.
 * @returns {{ outputPath: string, warnings: string[] }} Output path and any warnings
 * @throws {UnsupportedExtensionError} If the input file extension is unsupported
 * @throws {FileIOError} If a file system operation fails
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
  log(`  Output written successfully.`);

  return { outputPath, warnings };
}

/**
 * Processes all supported OData files in a folder and converts each to OpenAPI format.
 *
 * @param {string} inputFolder - Input folder path containing OData CSDL files
 * @param {string} outputFolder - Output folder path for generated OpenAPI files
 * @param {object} options - Conversion options passed to odata-openapi
 * @param {function} [log] - Optional logger callback (e.g. console.log). No-op when omitted.
 * @param {function} [onFileComplete] - Called after each file with the per-file result object. No-op when omitted.
 * @returns {object} Summary containing total, successful, failed counts and per-file results
 * @throws {Error} If the input folder is not found
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

  // Ensure output folder exists
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
};
