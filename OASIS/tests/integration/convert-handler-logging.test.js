// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Integration tests for convert-handler.js error-logging changes.
 *
 * Covers:
 *   - 4xx errors: context.error receives code only (no message)
 *   - 5xx errors: context.error receives scrubbed message and stack
 *   - Path scrubbing strips Windows and Unix paths from 5xx logs
 *   - Error response body hides internal details for 5xx
 *   - Error response body exposes message for 4xx
 *   - line/column included in response when available
 *   - validationMessages included when present
 *   - ERROR_CODE fallback to INTERNAL_ERROR
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { convertHandler } = require("../../api/lib/convert-handler.js");

/** Creates a mock Azure Functions HttpRequest. */
function mockRequest(body) {
  return { json: async () => body };
}

/** Creates a mock context that captures the error log. */
function createMockContext() {
  const logs = { errors: [] };
  return {
    ctx: {
      error: (...args) => logs.errors.push(args),
      log: () => {},
      warn: () => {},
    },
    logs,
  };
}

// ── 4xx error logging ────────────────────────────────────────

describe("convertHandler — 4xx error logging", () => {
  it("should NOT log message for UnsupportedExtensionError (400)", async () => {
    const { ctx, logs } = createMockContext();
    const response = await convertHandler(
      mockRequest({ fileName: "data.txt", content: "hello" }),
      ctx
    );

    assert.equal(response.status, 400);
    assert.equal(logs.errors.length, 1);

    const loggedObj = logs.errors[0][1];
    assert.equal(loggedObj.name, "UnsupportedExtensionError");
    assert.equal(loggedObj.code, "UNSUPPORTED_EXTENSION");
    assert.equal(loggedObj.message, undefined, "Should NOT log message for 4xx");
    assert.equal(loggedObj.stack, undefined, "Should NOT log stack for 4xx");
  });

  it("should expose error message in response body for 4xx", async () => {
    const { ctx } = createMockContext();
    const response = await convertHandler(
      mockRequest({ fileName: "data.txt", content: "hello" }),
      ctx
    );

    assert.equal(response.status, 400);
    assert.ok(response.jsonBody.error.includes(".txt"), "4xx response should show message");
    assert.equal(response.jsonBody.errorType, "UnsupportedExtensionError");
    assert.equal(response.jsonBody.code, "UNSUPPORTED_EXTENSION");
  });

  it("should NOT log message for XmlParseError (422)", async () => {
    const { ctx, logs } = createMockContext();
    const response = await convertHandler(
      mockRequest({ fileName: "test.xml", content: "<broken><no-close" }),
      ctx
    );

    assert.equal(response.status, 422);
    assert.equal(logs.errors.length, 1);

    const loggedObj = logs.errors[0][1];
    assert.equal(loggedObj.message, undefined, "Should NOT log message for 422");
    assert.equal(loggedObj.stack, undefined, "Should NOT log stack for 422");
  });

  it("should expose error message in response body for 422", async () => {
    const { ctx } = createMockContext();
    const response = await convertHandler(
      mockRequest({ fileName: "test.xml", content: "<broken><no-close" }),
      ctx
    );

    assert.equal(response.status, 422);
    assert.ok(response.jsonBody.error.length > 0, "422 should expose message");
    assert.ok(response.jsonBody.errorType);
  });

  it("should include line/column in 422 response when available", async () => {
    const { ctx } = createMockContext();
    const response = await convertHandler(
      mockRequest({ fileName: "test.xml", content: "<broken><no-close" }),
      ctx
    );

    // XmlParseError may include line/column
    if (response.jsonBody.line !== undefined) {
      assert.equal(typeof response.jsonBody.line, "number");
      assert.equal(typeof response.jsonBody.column, "number");
    }
  });
});

// ── 5xx error logging ────────────────────────────────────────

describe("convertHandler — 5xx error logging", () => {
  it("should log scrubbed message for 500 errors", async () => {
    // Force a 500 by making request.json() throw an error with a path
    const { ctx, logs } = createMockContext();
    const badRequest = {
      json: async () => {
        const err = new Error("Crash at C:\\Users\\dev\\converter.js:42");
        throw err;
      },
    };

    const response = await convertHandler(badRequest, ctx);

    assert.equal(response.status, 500);
    assert.equal(logs.errors.length, 1);

    const loggedObj = logs.errors[0][1];
    assert.ok(loggedObj.message, "Should log message for 5xx");
    assert.ok(!loggedObj.message.includes("C:\\Users"), "Should scrub Windows paths");
    assert.ok(loggedObj.message.includes("<path>"), "Should replace with <path>");
  });

  it("should log scrubbed stack trace for 500 errors", async () => {
    const { ctx, logs } = createMockContext();
    const badRequest = {
      json: async () => {
        throw new Error("Internal failure at /home/user/app/converter.js:99");
      },
    };

    const response = await convertHandler(badRequest, ctx);

    const loggedObj = logs.errors[0][1];
    assert.ok(loggedObj.stack, "Should log stack for 5xx");
    // The stack will contain the actual throw location which has real paths
    assert.ok(!loggedObj.stack.includes("/home/user/"), "Should scrub Unix paths from stack");
  });

  it("should NOT expose internal details in 5xx response body", async () => {
    const { ctx } = createMockContext();
    const badRequest = {
      json: async () => {
        throw new Error("Sensitive internal error details here");
      },
    };

    const response = await convertHandler(badRequest, ctx);

    assert.equal(response.status, 500);
    assert.ok(!response.jsonBody.error.includes("Sensitive"), "5xx should hide message");
    assert.ok(response.jsonBody.error.includes("internal error"), "Should use generic message");
    assert.equal(response.jsonBody.code, "INTERNAL_ERROR");
  });

  it("should include status in 5xx log object", async () => {
    const { ctx, logs } = createMockContext();
    const badRequest = {
      json: async () => { throw new Error("boom"); },
    };

    await convertHandler(badRequest, ctx);

    const loggedObj = logs.errors[0][1];
    assert.equal(loggedObj.status, 500);
  });

  it("should include empty validationMessages in 5xx log", async () => {
    const { ctx, logs } = createMockContext();
    const badRequest = {
      json: async () => { throw new Error("boom"); },
    };

    await convertHandler(badRequest, ctx);

    const loggedObj = logs.errors[0][1];
    assert.ok(Array.isArray(loggedObj.validationMessages));
  });
});

// ── Error code fallback ──────────────────────────────────────

describe("convertHandler — ERROR_CODE fallback", () => {
  it("should default code to INTERNAL_ERROR when err.code is missing", async () => {
    const { ctx, logs } = createMockContext();
    const badRequest = {
      json: async () => { throw new Error("generic error"); },
    };

    const response = await convertHandler(badRequest, ctx);

    assert.equal(response.jsonBody.code, "INTERNAL_ERROR");
    assert.equal(logs.errors[0][1].code, "INTERNAL_ERROR");
  });

  it("should use err.code when available", async () => {
    const { ctx } = createMockContext();
    const response = await convertHandler(
      mockRequest({ fileName: "test.txt", content: "data" }),
      ctx
    );

    assert.equal(response.jsonBody.code, "UNSUPPORTED_EXTENSION");
  });
});

// ── 400 validation (existing but extended) ────────────────────

describe("convertHandler — 400 missing fields", () => {
  it("should return 400 with INVALID_CONTENT code when fileName missing", async () => {
    const { ctx } = createMockContext();
    const response = await convertHandler(
      mockRequest({ content: "test" }),
      ctx
    );

    assert.equal(response.status, 400);
    assert.equal(response.jsonBody.code, "INVALID_CONTENT");
    assert.equal(response.jsonBody.errorType, "InvalidContentError");
  });

  it("should return 400 with INVALID_CONTENT code when content missing", async () => {
    const { ctx } = createMockContext();
    const response = await convertHandler(
      mockRequest({ fileName: "test.xml" }),
      ctx
    );

    assert.equal(response.status, 400);
    assert.equal(response.jsonBody.code, "INVALID_CONTENT");
  });

  it("should return 400 when body is empty object", async () => {
    const { ctx } = createMockContext();
    const response = await convertHandler(
      mockRequest({}),
      ctx
    );

    assert.equal(response.status, 400);
    assert.equal(response.jsonBody.code, "INVALID_CONTENT");
  });
});

// ── Path scrubbing edge cases (server-side) ──────────────────

describe("convertHandler — path scrubbing edge cases", () => {
  it("should scrub multiple paths in a single error message", async () => {
    const { ctx, logs } = createMockContext();
    const badRequest = {
      json: async () => {
        throw new Error("Failed: C:\\Users\\a\\b.js and /opt/app/c.js");
      },
    };

    await convertHandler(badRequest, ctx);

    const loggedObj = logs.errors[0][1];
    assert.ok(!loggedObj.message.includes("C:\\Users"), "Should scrub first path");
    assert.ok(!loggedObj.message.includes("/opt/app"), "Should scrub second path");
  });

  it("should handle error with no message gracefully", async () => {
    const { ctx, logs } = createMockContext();
    const badRequest = {
      json: async () => {
        const err = new Error();
        err.message = "";
        throw err;
      },
    };

    await convertHandler(badRequest, ctx);

    const loggedObj = logs.errors[0][1];
    assert.equal(typeof loggedObj.message, "string");
  });
});
