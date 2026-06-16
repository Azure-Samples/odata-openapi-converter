// +--------------------------------------------------------------
// <copyright file="telemetry.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Browser-side telemetry using the shared core TelemetryClient.
// This is a thin adapter that wires the core telemetry engine with a
// browser-specific fetch transport and localStorage-based UID persistence.
//
// All schema logic, payload building, and event structure are owned by
// core/telemetry — this file only provides the browser glue.
// ---------------------------------------------------------------

// Core telemetry module (CJS) — Vite handles interop via commonjsOptions.
import coreTelemetry from "@core/telemetry/index.js";
const { TelemetryClient, fetchTransport } = coreTelemetry;

/** Instrumentation key injected at build time by Vite. */
const IKEY = import.meta.env.VITE_APPINSIGHTS_IKEY || "";

/**
 * Persistent pseudonymous user id.
 * Stored in localStorage so it survives reloads, tabs, and sessions.
 */
function getUid() {
  const KEY = "oasis_uid";
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    const uid = crypto.randomUUID().slice(0, 12);
    localStorage.setItem(KEY, uid);
    return uid;
  } catch {
    return crypto.randomUUID().slice(0, 12);
  }
}

/** Shared TelemetryClient instance — same engine as CLI. */
const client = new TelemetryClient({
  ikey: IKEY,
  transport: fetchTransport,
  uid: getUid(),
  src: "web",
});

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Record a completed conversion run.
 *
 * @param {object} p - Event parameters
 * @param {string} p.rid - Run id
 * @param {number} p.total - Total files uploaded
 * @param {number} p.ok - Successful conversions
 * @param {number} p.fail - Failed conversions
 * @param {number} p.warn - Files with warnings
 * @param {Array}  [p.errors] - Error objects
 * @param {Object} [p.warnings] - Warning objects
 * @param {number} p.ms - Elapsed wall-clock ms
 * @param {string} [p.odataVersion] - OData version detected
 * @param {string} [p.apiType] - Primary schema namespace
 */
export function trackConvert({
  rid,
  total = 0,
  ok = 0,
  fail = 0,
  warn = 0,
  errors = [],
  warnings = {},
  ms = 0,
  odataVersion = "unknown",
  apiType = null,
}) {
  // Normalize warn count: use warnings object keys if larger
  const warnCount = Math.max(warn, Object.keys(warnings).length);

  client.trackConvert({
    rid,
    ok,
    fail,
    warn: warnCount,
    errors: errors.length > 0 ? errors : null,
    ms,
    odataVersion,
    apiType,
  });
}

/**
 * Record that the user downloaded the ZIP.
 * @param {string} rid - The run id from the conversion
 */
export function trackDownload(rid) {
  client.trackDownload(rid);
}

/**
 * Record skipped files as a standalone event.
 * @param {string[]} skipped - Skipped file names
 * @param {number} total - Total files attempted
 * @param {string} [skipReason="UNSUPPORTED_EXTENSION"]
 */
export function trackSkipped(skipped, total, skipReason = "UNSUPPORTED_EXTENSION") {
  client.trackSkipped(skipped, total, skipReason);
}