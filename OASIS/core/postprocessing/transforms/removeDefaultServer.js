// +--------------------------------------------------------------
// <copyright file="removeDefaultServer.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
// ---------------------------------------------------------------

/**
 * Default localhost URL pattern injected by the OASIS library
 * when no server URL is provided.
 */
const LOCALHOST_PATTERN = /localhost/i;

/**
 * Removes the servers block if it only contains the OASIS library's
 * default localhost URL. Removing it lets APIM auto-configure the
 * backend URL during import.
 *
 * @param {object} spec - OpenAPI specification object
 * @returns {object} Modified specification with localhost servers removed
 */
function removeDefaultServer(spec) {
  if (!Array.isArray(spec.servers) || spec.servers.length === 0) {
    return spec;
  }

  const allLocalhost = spec.servers.every(
    (s) => s.url && LOCALHOST_PATTERN.test(s.url)
  );

  if (allLocalhost) {
    delete spec.servers;
  }

  return spec;
}

module.exports = { removeDefaultServer, LOCALHOST_PATTERN };
