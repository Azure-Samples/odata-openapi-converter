#!/usr/bin/env node

// +--------------------------------------------------------------
// <copyright file="output.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Console output formatting helpers for the CLI.
// ---------------------------------------------------------------

const SEPARATOR = "=".repeat(60);

/**
 * Formats file size in human-readable form.
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Prints elapsed time summary.
 * @param {number} elapsed - Milliseconds
 * @param {number} totalFiles - Number of files processed
 */
function printElapsed(elapsed, totalFiles) {
  const timeStr = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(2)}s`;
  if (totalFiles > 1) {
    console.log(`\nFinished processing ${totalFiles} files in ${timeStr}`);
  } else {
    console.log(`\nFinished in ${timeStr}`);
  }
}

module.exports = { SEPARATOR, formatFileSize, printElapsed };
