// +--------------------------------------------------------------
// <copyright file="telemetry.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview Browser-side Application Insights telemetry helper.
//
// Uses a fire-and-forget POST to the App Insights public ingestion
// endpoint with only the instrumentation key — no SDK, no connection
// string.  Safe for open-source bundles.
//
// Emits ONE "OasisRun" customEvent per conversion run.  The event is
// deferred: data is collected during convert, then flushed either when
// the user downloads the ZIP or when the page unloads — whichever
// comes first.  This avoids duplicate rows.
//
// ┌──────────┬────────────────────────────────────────────────────┐
// │ Column   │ Description                                       │
// ├──────────┼────────────────────────────────────────────────────┤
// │ ts       │ ISO-8601 timestamp of the conversion              │
// │ rid      │ Run id (12-char hex, unique per conversion click) │
// │ uid      │ Pseudonymous session id (persisted in storage)    │
// │ src      │ "web"                                             │
// │ tot      │ Total files uploaded for this run                 │
// │ ok       │ Files converted successfully                      │
// │ fail     │ Files that failed conversion                      │
// │ warn     │ Count of files that produced warnings             │
// │ st       │ Roll-up status: "ok" | "partial" | "fail"         │
// │ ms       │ Wall-clock milliseconds for the conversion        │
// │ dl       │ "1" if user downloaded the ZIP, else "0"          │
// │ errors   │ Raw JSON array of per-file error objects          │
// │ warnings │ Raw JSON object of per-file warning arrays        │
// │ skipped  │ Raw JSON array of skipped file names              │
// └──────────┴────────────────────────────────────────────────────┘
//
// KQL cheat-sheet:
//   customEvents | where name == "OasisRun"
//   | extend p = customDimensions
//   | extend src = tostring(p.src), st = tostring(p.st),
//           tot = toint(p.tot), ms = todouble(p.ms)
//   | summarize runs=count() by bin(timestamp, 1d), src
// ---------------------------------------------------------------

/** App Insights public ingestion endpoint. */
const INGESTION_URL = "https://dc.services.visualstudio.com/v2/track";

/** Instrumentation key injected at build time by Vite. */
const IKEY = import.meta.env.VITE_APPINSIGHTS_IKEY || "";

/**
 * Persistent pseudonymous user id.
 * Stored in localStorage so it survives reloads, tabs, and sessions.
 * Same browser + same origin = same uid.
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
    // localStorage unavailable
    return crypto.randomUUID().slice(0, 12);
  }
}

/** Send a payload to App Insights. Fire-and-forget. */
function send(props) {
  if (!IKEY) return;

  const payload = JSON.stringify([
    {
      name: "AppEvents",
      iKey: IKEY,
      time: props.ts,
      data: {
        baseType: "EventData",
        baseData: {
          name: "OasisRun",
          properties: props,
        },
      },
    },
  ]);

  try {
    fetch(INGESTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Record a completed conversion run.  Emits immediately.
 *
 * @param {object}   p
 * @param {string}   p.rid       - Run id
 * @param {number}   p.total     - Total files uploaded
 * @param {number}   p.ok        - Successful conversions
 * @param {number}   p.fail      - Failed conversions
 * @param {number}   p.warn      - Files with warnings
 * @param {Array}    [p.errors]  - Raw array of { name, error, errorType, code }
 * @param {Object}   [p.warnings]- Raw { fileName: string[] }
 * @param {number}   p.ms        - Elapsed wall-clock ms
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
}) {
  if (!IKEY) return;

  const st = fail === 0 ? "ok" : ok === 0 ? "fail" : "partial";

  const props = {
    ts: new Date().toISOString(),
    rid,
    uid: getUid(),
    src: "web",
    tot: String(total),
    ok: String(ok),
    fail: String(fail),
    warn: String(warn),
    st,
    ms: String(Math.round(ms)),
    dl: "0",
  };

  // 5xx codes: include the error message for debugging (no PII — these
  // are internal converter/SDK errors, filenames are not in the message).
  // 4xx codes: send only the error code — messages may echo user input.
  const INTERNAL_CODES = new Set(["INTERNAL_ERROR", "IO_ERROR"]);
  if (errors.length > 0) {
    props.errors = JSON.stringify(
      errors.map((e) => {
        const code = e.errorType || e.code || "UNKNOWN";
        if (INTERNAL_CODES.has(e.code)) {
          return { type: code, error: e.error || "" };
        }
        return { type: code };
      }),
    );
  }
  if (Object.keys(warnings).length > 0) {
    props.warn = String(Object.keys(warnings).length);
  }

  send(props);
}

/**
 * Record that the user downloaded the ZIP.
 * Lightweight event — only rid, uid, dl. Join on rid in KQL.
 *
 * @param {string} rid - The run id from the conversion
 */
export function trackDownload(rid) {
  if (!IKEY) return;

  send({
    ts: new Date().toISOString(),
    rid,
    uid: getUid(),
    src: "web",
    dl: "1",
  });
}

/**
 * Record an invalid-file upload as a standalone event.
 * Emitted immediately since there's no conversion to defer to.
 *
 * @param {string[]} skipped - Skipped file names
 * @param {number}   total   - Total files the user tried to upload
 * @param {string}   [skipReason="UNSUPPORTED_EXTENSION"] - Why files were skipped
 */
export function trackSkipped(skipped, total, skipReason = "UNSUPPORTED_EXTENSION") {
  if (!IKEY) return;

  send({
    ts: new Date().toISOString(),
    rid: crypto.randomUUID().slice(0, 12),
    uid: getUid(),
    src: "web",
    tot: String(total),
    ok: "0",
    fail: "0",
    warn: "0",
    st: "skipped",
    ms: "0",
    dl: "0",
    skipped: String(skipped.length),
    skipRsn: skipReason,
  });
}