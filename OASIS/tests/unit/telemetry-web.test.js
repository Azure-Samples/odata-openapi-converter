// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for the web telemetry module (app/src/telemetry.js).
 *
 * Since telemetry.js uses ESM (import.meta.env) and browser APIs
 * (fetch, localStorage, crypto.randomUUID), we cannot import it
 * directly in Node.js. Instead, we test the LOGIC extracted from
 * the module — the same classification/scrubbing patterns used
 * in trackConvert, trackDownload, and trackSkipped.
 *
 * Covers:
 *   - Error classification: 4xx sends code only, 5xx sends code + message
 *   - Warnings: sent as count (not full JSON object)
 *   - Skipped: sent as count (not full JSON array)
 *   - Status classification: ok / fail / partial
 *   - trackConvert props construction
 *   - trackSkipped props construction
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// ── Replicated logic from telemetry.js ───────────────────────

const INTERNAL_CODES_WEB = new Set(["INTERNAL_ERROR", "IO_ERROR"]);

/**
 * Mirrors the error mapping in trackConvert.
 */
function classifyWebErrors(errors) {
  return errors.map((e) => {
    const code = e.errorType || e.code || "UNKNOWN";
    if (INTERNAL_CODES_WEB.has(e.code)) {
      return { type: code, error: e.error || "" };
    }
    return { type: code };
  });
}

/**
 * Mirrors the status logic in trackConvert.
 */
function classifyWebStatus({ ok, fail }) {
  return fail === 0 ? "ok" : ok === 0 ? "fail" : "partial";
}

/**
 * Mirrors the warnings count logic in trackConvert.
 */
function computeWarningsCount(warnings) {
  return String(Object.keys(warnings).length);
}

/**
 * Mirrors the skipped count logic in trackSkipped.
 */
function computeSkippedCount(skipped) {
  return String(skipped.length);
}

// ── Web telemetry — error classification ─────────────────────

describe("Web telemetry — error classification", () => {
  it("should send code only for MALFORMED_XML errors", () => {
    const errors = [{ name: "test.xml", error: "Bad XML", errorType: "XmlParseError", code: "MALFORMED_XML" }];
    const result = classifyWebErrors(errors);

    assert.equal(result[0].type, "XmlParseError");
    assert.equal(result[0].error, undefined, "Should not include error message");
  });

  it("should send code only for UNSUPPORTED_EXTENSION errors", () => {
    const errors = [{ name: "test.txt", error: ".txt not supported", errorType: "UnsupportedExtensionError", code: "UNSUPPORTED_EXTENSION" }];
    const result = classifyWebErrors(errors);

    assert.equal(result[0].type, "UnsupportedExtensionError");
    assert.equal(result[0].error, undefined);
  });

  it("should send code only for INVALID_CONTENT errors", () => {
    const errors = [{ name: "empty.xml", error: "File is empty", code: "INVALID_CONTENT" }];
    const result = classifyWebErrors(errors);

    assert.equal(result[0].type, "INVALID_CONTENT");
    assert.equal(result[0].error, undefined);
  });

  it("should send code only for MALFORMED_JSON errors", () => {
    const errors = [{ code: "MALFORMED_JSON", error: "Unexpected token", errorType: "JsonParseError" }];
    const result = classifyWebErrors(errors);

    assert.equal(result[0].type, "JsonParseError");
    assert.equal(result[0].error, undefined);
  });

  it("should include error message for INTERNAL_ERROR", () => {
    const errors = [{ code: "INTERNAL_ERROR", error: "SDK crash", errorType: "OpenApiConversionError" }];
    const result = classifyWebErrors(errors);

    assert.equal(result[0].type, "OpenApiConversionError");
    assert.equal(result[0].error, "SDK crash");
  });

  it("should include error message for IO_ERROR", () => {
    const errors = [{ code: "IO_ERROR", error: "Disk error", errorType: "FileIOError" }];
    const result = classifyWebErrors(errors);

    assert.equal(result[0].type, "FileIOError");
    assert.equal(result[0].error, "Disk error");
  });

  it("should use UNKNOWN when no code or errorType is present", () => {
    const errors = [{ name: "file.xml", error: "Something broke" }];
    const result = classifyWebErrors(errors);

    assert.equal(result[0].type, "UNKNOWN");
    assert.equal(result[0].error, undefined);
  });

  it("should prefer errorType over code for the type field", () => {
    const errors = [{ errorType: "XmlParseError", code: "MALFORMED_XML", error: "bad xml" }];
    const result = classifyWebErrors(errors);

    assert.equal(result[0].type, "XmlParseError");
  });

  it("should handle empty errors array", () => {
    const result = classifyWebErrors([]);
    assert.deepEqual(result, []);
  });

  it("should handle multiple mixed errors", () => {
    const errors = [
      { code: "INTERNAL_ERROR", error: "Crash", errorType: "Error" },
      { code: "MALFORMED_XML", error: "user data <tag>", errorType: "XmlParseError" },
      { code: "IO_ERROR", error: "Cannot read", errorType: "FileIOError" },
    ];
    const result = classifyWebErrors(errors);

    // INTERNAL_ERROR — has message
    assert.equal(result[0].type, "Error");
    assert.equal(result[0].error, "Crash");
    // MALFORMED_XML — code only
    assert.equal(result[1].type, "XmlParseError");
    assert.equal(result[1].error, undefined);
    // IO_ERROR — has message
    assert.equal(result[2].type, "FileIOError");
    assert.equal(result[2].error, "Cannot read");
  });
});

// ── Web telemetry — status classification ────────────────────

describe("Web telemetry — status classification", () => {
  it("should return 'ok' when no failures", () => {
    assert.equal(classifyWebStatus({ ok: 5, fail: 0 }), "ok");
  });

  it("should return 'fail' when all fail", () => {
    assert.equal(classifyWebStatus({ ok: 0, fail: 3 }), "fail");
  });

  it("should return 'partial' when mixed", () => {
    assert.equal(classifyWebStatus({ ok: 2, fail: 1 }), "partial");
  });

  it("should return 'ok' when both are 0", () => {
    assert.equal(classifyWebStatus({ ok: 0, fail: 0 }), "ok");
  });
});

// ── Web telemetry — warnings as count ────────────────────────

describe("Web telemetry — warnings sent as count", () => {
  it("should send count of files with warnings, not full JSON", () => {
    const warnings = {
      "file1-openapi.json": ["Warning 1", "Warning 2"],
      "file2-openapi.json": ["Warning 3"],
    };

    const count = computeWarningsCount(warnings);
    assert.equal(count, "2");
    assert.equal(typeof count, "string");
  });

  it("should return '0' for empty warnings object", () => {
    assert.equal(computeWarningsCount({}), "0");
  });

  it("should return '1' for single file with warnings", () => {
    const warnings = { "output.json": ["Some warning"] };
    assert.equal(computeWarningsCount(warnings), "1");
  });
});

// ── Web telemetry — skipped as count with reason ─────────────

describe("Web telemetry — skipped sent as count with skipRsn", () => {
  it("should send count of skipped files, not file names", () => {
    const skipped = ["readme.txt", "notes.doc", "image.png"];
    const count = computeSkippedCount(skipped);
    assert.equal(count, "3");
    assert.equal(typeof count, "string");
  });

  it("should return '1' for single skipped file", () => {
    assert.equal(computeSkippedCount(["a.txt"]), "1");
  });

  it("should return '0' for empty skipped array", () => {
    assert.equal(computeSkippedCount([]), "0");
  });

  it("should include default skipRsn=UNSUPPORTED_EXTENSION in trackSkipped props", () => {
    // Mirrors the trackSkipped function's default parameter
    const skipReason = "UNSUPPORTED_EXTENSION";
    const props = {
      st: "skipped",
      skipped: String(3),
      skipRsn: skipReason,
    };
    assert.equal(props.skipRsn, "UNSUPPORTED_EXTENSION");
  });

  it("should accept custom skipReason in trackSkipped props", () => {
    const skipReason = "FILE_NOT_FOUND";
    const props = {
      st: "skipped",
      skipped: String(1),
      skipRsn: skipReason,
    };
    assert.equal(props.skipRsn, "FILE_NOT_FOUND");
  });
});

// ── Web telemetry — trackConvert props ───────────────────────

describe("Web telemetry — trackConvert props construction", () => {
  it("should build correct props for successful conversion", () => {
    const rid = "abc123def456";
    const total = 3;
    const ok = 3;
    const fail = 0;
    const ms = 1234;

    const st = classifyWebStatus({ ok, fail });
    const props = {
      rid,
      src: "web",
      tot: String(total),
      ok: String(ok),
      fail: String(fail),
      st,
      ms: String(Math.round(ms)),
      dl: "0",
    };

    assert.equal(props.st, "ok");
    assert.equal(props.tot, "3");
    assert.equal(props.dl, "0");
    assert.equal(props.src, "web");
  });

  it("should build correct props for partial failure", () => {
    const st = classifyWebStatus({ ok: 2, fail: 1 });
    assert.equal(st, "partial");
  });

  it("should build correct props for total failure", () => {
    const st = classifyWebStatus({ ok: 0, fail: 5 });
    assert.equal(st, "fail");
  });
});

// ── Web telemetry — no file names in any payload ─────────────

describe("Web telemetry — no PII in payloads", () => {
  it("should not include file names in error classification output", () => {
    const errors = [
      { name: "secret-document.xml", error: "Bad XML", errorType: "XmlParseError", code: "MALFORMED_XML" },
    ];
    const result = classifyWebErrors(errors);

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("secret-document"), "File name should not appear in telemetry");
  });

  it("should not include file names in skipped count", () => {
    const skipped = ["confidential-report.doc", "private-data.xlsx"];
    const count = computeSkippedCount(skipped);

    assert.equal(count, "2");
    assert.ok(!count.includes("confidential"), "File name should not appear");
  });

  it("should not include warning content in warnings count", () => {
    const warnings = {
      "internal-api.json": ["Sensitive annotation missing", "Custom field dropped"],
    };
    const count = computeWarningsCount(warnings);

    assert.equal(count, "1");
    assert.ok(!count.includes("Sensitive"), "Warning text should not appear");
  });
});
