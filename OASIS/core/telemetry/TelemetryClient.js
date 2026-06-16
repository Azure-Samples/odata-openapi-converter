// +--------------------------------------------------------------
// <copyright file="TelemetryClient.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Unified telemetry client with pluggable transport.
// CLI uses Node.js https module; Web uses fetch API.
// Both share the same schema and event building logic.
// ---------------------------------------------------------------

const { TELEMETRY_INGESTION_URL, TELEMETRY_TIMEOUT_MS } = require("../constants.js");
const { buildEventPayload, buildIngestionPayload } = require("./schemas.js");

/**
 * Telemetry client with dependency-injected transport.
 * Follows the Strategy pattern for the transport layer.
 *
 * @example
 * // CLI usage with Node.js https:
 * const client = new TelemetryClient({
 *   ikey: process.env.OASIS_APPINSIGHTS_IKEY,
 *   transport: nodeHttpsTransport,
 *   uid: hostIdHash,
 *   src: "cli",
 * });
 *
 * // Web usage with fetch:
 * const client = new TelemetryClient({
 *   ikey: import.meta.env.VITE_APPINSIGHTS_IKEY,
 *   transport: fetchTransport,
 *   uid: getUid(),
 *   src: "web",
 * });
 */
class TelemetryClient {
  /**
   * @param {object} config
   * @param {string} config.ikey - App Insights instrumentation key (empty = disabled)
   * @param {function(string, string): Promise<void>} config.transport - Transport function(url, payload)
   * @param {string} config.uid - Pseudonymous user identifier
   * @param {string} config.src - Source surface ("cli" or "web")
   */
  constructor({ ikey = "", transport, uid, src }) {
    this._ikey = ikey;
    this._transport = transport;
    this._uid = uid;
    this._src = src;
  }

  /**
   * Whether telemetry is enabled (ikey is configured).
   * @returns {boolean}
   */
  get enabled() {
    return Boolean(this._ikey);
  }

  /**
   * Tracks a conversion run event.
   *
   * @param {object} params - Event parameters (see schemas.buildEventPayload)
   * @returns {Promise<void>}
   */
  async trackConvert(params) {
    if (!this.enabled) return;

    const props = buildEventPayload({
      ...params,
      uid: this._uid,
      src: this._src,
    });

    const payload = buildIngestionPayload(props, this._ikey);
    await this._send(payload);
  }

  /**
   * Tracks a ZIP download event (web only).
   *
   * @param {string} rid - Run ID from the conversion
   * @returns {Promise<void>}
   */
  async trackDownload(rid) {
    if (!this.enabled) return;

    const props = {
      ts: new Date().toISOString(),
      rid,
      uid: this._uid,
      src: this._src,
      dl: "1",
    };

    const payload = buildIngestionPayload(props, this._ikey);
    await this._send(payload);
  }

  /**
   * Tracks skipped files event.
   *
   * @param {string[]} skipped - Skipped file names
   * @param {number} total - Total files attempted
   * @param {string} [skipReason="UNSUPPORTED_EXTENSION"]
   * @returns {Promise<void>}
   */
  async trackSkipped(skipped, total, skipReason = "UNSUPPORTED_EXTENSION") {
    if (!this.enabled) return;

    const props = buildEventPayload({
      rid: this._generateRid(),
      uid: this._uid,
      src: this._src,
      ok: 0,
      fail: 0,
      warn: 0,
      skipped,
      skipReason,
      ms: 0,
      dl: "0",
    });

    const payload = buildIngestionPayload(props, this._ikey);
    await this._send(payload);
  }

  /**
   * Sends payload via configured transport. Fire-and-forget with timeout.
   * @param {string} payload - JSON payload
   * @returns {Promise<void>}
   * @private
   */
  async _send(payload) {
    try {
      const send = this._transport(TELEMETRY_INGESTION_URL, payload);
      const deadline = new Promise((resolve) =>
        setTimeout(resolve, TELEMETRY_TIMEOUT_MS)
      );
      await Promise.race([send, deadline]);
    } catch {
      // Telemetry failures are always silent
    }
  }

  /**
   * Generates a short random run ID.
   * @returns {string}
   * @private
   */
  _generateRid() {
    // Works in both Node.js and browser
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().slice(0, 12);
    }
    return Math.random().toString(36).slice(2, 14);
  }
}

module.exports = { TelemetryClient };
