// +--------------------------------------------------------------
// <copyright file="scrubber.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Path and PII scrubbing utilities for telemetry payloads.
// Ensures no filesystem paths or personal data leak into telemetry.
// ---------------------------------------------------------------

/**
 * Regex matching Windows-style paths (e.g. C:\Users\foo\bar).
 */
const WINDOWS_PATH_RE = /[A-Z]:\\[^\s:)]+/gi;

/**
 * Regex matching Unix-style paths (e.g. /home/user/file.js).
 */
const UNIX_PATH_RE = /\/[\w./-]+/gi;

/**
 * Scrubs filesystem paths from a string, replacing them with "<path>".
 *
 * @param {string} str - String potentially containing file paths
 * @returns {string} Scrubbed string with paths replaced
 */
function scrubPaths(str) {
  if (!str) return "";
  return str.replace(WINDOWS_PATH_RE, "<path>").replace(UNIX_PATH_RE, "<path>");
}

module.exports = { scrubPaths, WINDOWS_PATH_RE, UNIX_PATH_RE };
