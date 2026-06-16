// +--------------------------------------------------------------
// <copyright file="validators.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview File-level validation utilities for extension and size checks.
// ---------------------------------------------------------------

const path = require("path");
const { SUPPORTED_EXTENSIONS, MAX_FILE_SIZE_BYTES } = require("../constants.js");
const { UnsupportedExtensionError, FileTooLargeError } = require("../errors.js");

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

/**
 * Validates file size against the maximum limit.
 *
 * @param {number} sizeBytes - File size in bytes
 * @throws {FileTooLargeError} If file exceeds the limit
 */
function validateFileSize(sizeBytes) {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new FileTooLargeError(sizeBytes);
  }
}

module.exports = {
  isSupportedFile,
  validateExtension,
  validateFileSize,
};
