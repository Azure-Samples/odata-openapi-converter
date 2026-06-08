// +--------------------------------------------------------------
// <copyright file="transports.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Transport implementations for telemetry delivery.
// Each transport is a function(url, payload) → Promise<void>.
// ---------------------------------------------------------------

const { TELEMETRY_TIMEOUT_MS } = require("../constants.js");

/**
 * Node.js HTTPS transport for CLI environments.
 * Uses the built-in https module with a timeout.
 *
 * @param {string} url - Ingestion endpoint URL
 * @param {string} payload - JSON payload string
 * @returns {Promise<void>}
 */
function nodeHttpsTransport(url, payload) {
  const https = require("https");
  return new Promise((resolve) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: TELEMETRY_TIMEOUT_MS,
      },
      () => resolve()
    );
    req.on("error", () => resolve());
    req.on("timeout", () => { req.destroy(); resolve(); });
    req.end(payload);
  });
}

/**
 * Fetch API transport for browser/Web environments.
 * Uses keepalive to survive page unloads.
 *
 * @param {string} url - Ingestion endpoint URL
 * @param {string} payload - JSON payload string
 * @returns {Promise<void>}
 */
function fetchTransport(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).then(() => {}).catch(() => {});
}

module.exports = { nodeHttpsTransport, fetchTransport };
