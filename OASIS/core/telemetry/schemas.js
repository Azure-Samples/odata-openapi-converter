// +--------------------------------------------------------------
// <copyright file="schemas.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Telemetry event schema definitions shared between CLI and Web.
// Ensures both surfaces emit identical event structures.
// ---------------------------------------------------------------

const { INTERNAL_ERROR_CODES, TELEMETRY_EVENT_NAME } = require("../constants.js");
const { scrubPaths } = require("./scrubber.js");

/**
 * Maps abbreviated telemetry field names to their full descriptive names.
 * Abbreviated names reduce data volume in App Insights (charged per byte).
 * This constant serves as a readable reference — it is NOT used at runtime.
 */
const TELEMETRY_FIELDS = Object.freeze({
  ts: "timestamp",
  sv: "schemaVersion",
  dc: "dataClassification",
  rid: "runId",
  uid: "userId",
  src: "source",
  tot: "totalFiles",
  ok: "successCount",
  fail: "failCount",
  warn: "warnCount",
  st: "status",
  ms: "durationMs",
  dl: "downloaded",
  odata: "odataVersion",
  apiType: "apiType",
  errors: "errors",
  skipped: "skippedCount",
  skipRsn: "skipReason",
});

/**
 * Builds a standardized "OasisRun" telemetry event payload.
 *
 * @param {object} params
 * @param {string} params.rid - Run ID (unique per conversion)
 * @param {string} params.uid - Pseudonymous user/session ID
 * @param {string} params.src - Source surface ("cli" or "web")
 * @param {number} params.ok - Successful conversion count
 * @param {number} params.fail - Failed conversion count
 * @param {number} [params.warn=0] - Files with warnings
 * @param {Array|null} [params.errors] - Error objects [{message, code, file}]
 * @param {Array|null} [params.skipped] - Skipped file names
 * @param {string|null} [params.skipReason] - Reason for skip
 * @param {number} params.ms - Elapsed milliseconds
 * @param {string} [params.dl="0"] - Download flag ("1" or "0")
 * @param {string} [params.odataVersion] - OData version detected
 * @returns {object} Formatted telemetry properties including ts, sv, dc, rid, uid, and related event fields
 */
function buildEventPayload({
  rid,
  uid,
  src,
  ok,
  fail,
  warn = 0,
  errors = null,
  skipped = null,
  skipReason = null,
  ms,
  dl = "0",
  odataVersion = null,
  apiType = null,
}) {
  const total = ok + fail;
  const st = skipped && skipped.length > 0
    ? "skipped"
    : fail === 0 ? "ok" : ok === 0 ? "fail" : "partial";

  const props = {
    ts: new Date().toISOString(), // timestamp
    sv: "1", // schemaVersion
    dc: "SystemMetadata", // dataClassification
    rid, // runId
    uid, // userId
    src, // source ("cli" | "web")
    tot: String(total), // totalFiles
    ok: String(ok), // successCount
    fail: String(fail), // failCount
    warn: String(warn), // warnCount
    st, // status ("ok" | "partial" | "fail" | "skipped")
    ms: String(Math.round(ms)), // durationMs
    dl, // downloaded ("0" | "1")
  };

  if (odataVersion) {
    props.odata = odataVersion;
  }

  if (apiType && apiType !== "unknown") {
    props.apiType = apiType;
  }

  if (fail > 0 && errors && errors.length > 0) {
    props.errors = JSON.stringify(
      errors.map((e) => {
        const code = e.code || e.errorType || "UNKNOWN";
        if (INTERNAL_ERROR_CODES.has(code)) {
          return { type: code, error: scrubPaths(e.message || e.error || String(e)) };
        }
        return { type: code };
      })
    );
  }

  if (skipped && skipped.length > 0) {
    props.skipped = String(skipped.length);
    if (skipReason) props.skipRsn = skipReason;
  }

  return props;
}

/**
 * Wraps a properties object in the App Insights envelope format.
 *
 * @param {object} props - Event properties from buildEventPayload
 * @param {string} ikey - App Insights instrumentation key
 * @returns {string} JSON string ready for POST to ingestion endpoint
 */
function buildIngestionPayload(props, ikey) {
  return JSON.stringify([
    {
      name: "AppEvents",
      iKey: ikey,
      time: props.ts,
      data: {
        baseType: "EventData",
        baseData: {
          name: TELEMETRY_EVENT_NAME,
          properties: props,
        },
      },
    },
  ]);
}

module.exports = { TELEMETRY_FIELDS, buildEventPayload, buildIngestionPayload };
