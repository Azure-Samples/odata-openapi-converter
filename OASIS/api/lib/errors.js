// +--------------------------------------------------------------
// <copyright file="errors.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Custom error classes for the OASIS converter pipeline.
// Each error corresponds to a distinct failure stage, enabling callers
// to handle errors precisely (e.g. map to HTTP status codes).
// ---------------------------------------------------------------

const { SUPPORTED_EXTENSIONS, ERROR_CODE, MAX_FILE_SIZE_BYTES } = require("./constants.js");

/**
 * Thrown when the input file has an unsupported extension.
 */
class UnsupportedExtensionError extends Error {
  constructor(ext) {
    super(
      `Unsupported file extension "${ext}". Supported extensions: ${SUPPORTED_EXTENSIONS.join(", ")}`
    );
    this.name = "UnsupportedExtensionError";
    this.code = ERROR_CODE.UNSUPPORTED_EXTENSION;
    this.extension = ext;
  }
}

/**
 * Thrown when a file exceeds the maximum allowed size.
 */
class FileTooLargeError extends Error {
  constructor(actualBytes) {
    const limitMiB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    super(
      `File size (${(actualBytes / (1024 * 1024)).toFixed(2)} MiB) exceeds the ${limitMiB} MiB limit.`
    );
    this.name = "FileTooLargeError";
    this.code = ERROR_CODE.FILE_TOO_LARGE;
    this.actualBytes = actualBytes;
  }
}

/**
 * Thrown when the input content is empty, null, or cannot be
 * identified as valid XML or JSON.
 */
class InvalidContentError extends Error {
  constructor(detail) {
    super(`The uploaded file is empty or unreadable: ${detail}`);
    this.name = "InvalidContentError";
    this.code = ERROR_CODE.INVALID_CONTENT;
  }
}

/**
 * Thrown when XML content is malformed and cannot be parsed by SAX.
 * Includes line/column info when available.
 */
class XmlParseError extends Error {
  constructor(detail, cause) {
    super(`The file contains malformed XML: ${detail}`);
    this.name = "XmlParseError";
    this.code = ERROR_CODE.MALFORMED_XML;
    if (cause?.parser) {
      this.line = cause.parser.line;
      this.column = cause.parser.column;
      this.construct = cause.parser.construct;
    }
    this.cause = cause;
  }
}

/**
 * Thrown when JSON content is syntactically invalid.
 */
class JsonParseError extends Error {
  constructor(detail, cause) {
    super(`The file contains malformed JSON: ${detail}`);
    this.name = "JsonParseError";
    this.code = ERROR_CODE.MALFORMED_JSON;
    this.cause = cause;
  }
}

/**
 * Thrown when xml2json conversion fails (e.g. unexpected root element,
 * missing required attributes, structural CSDL errors).
 * Includes validation messages collected before the failure.
 */
class CsdlParseError extends Error {
  constructor(detail, cause, messages) {
    super(`The file does not appear to be a valid OData CSDL document: ${detail}`);
    this.name = "CsdlParseError";
    this.code = ERROR_CODE.INVALID_CSDL;
    this.validationMessages = messages || [];
    if (cause?.parser) {
      this.line = cause.parser.line;
      this.column = cause.parser.column;
      this.construct = cause.parser.construct;
    }
    this.cause = cause;
  }
}

/**
 * Thrown when csdl2openapi conversion fails or produces an invalid result.
 */
class OpenApiConversionError extends Error {
  constructor(detail, cause, messages) {
    super(`OpenAPI conversion failed: ${detail}`);
    this.name = "OpenApiConversionError";
    this.code = ERROR_CODE.INTERNAL_ERROR;
    this.validationMessages = messages || [];
    this.cause = cause;
  }
}

/**
 * Thrown when post-processing (e.g. addPutMethods) fails.
 */
class PostProcessingError extends Error {
  constructor(detail, cause) {
    super(`Post-processing failed: ${detail}`);
    this.name = "PostProcessingError";
    this.code = ERROR_CODE.INTERNAL_ERROR;
    this.cause = cause;
  }
}

/**
 * Thrown when a file system operation (read, write, mkdir) fails.
 * Preserves the original system error code (ENOENT, EACCES, etc.)
 * while providing a stable API-facing code.
 */
class FileIOError extends Error {
  constructor(detail, cause) {
    super(`File I/O error: ${detail}`);
    this.name = "FileIOError";
    this.code = ERROR_CODE.IO_ERROR;
    this.systemCode = cause?.code || null;
    this.cause = cause;
  }
}

module.exports = {
  UnsupportedExtensionError,
  FileTooLargeError,
  InvalidContentError,
  XmlParseError,
  JsonParseError,
  CsdlParseError,
  OpenApiConversionError,
  PostProcessingError,
  FileIOError,
};
