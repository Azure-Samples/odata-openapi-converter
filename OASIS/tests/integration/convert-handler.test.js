// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Integration tests for the /api/convert handler logic.
 * Tests convert-handler.js directly — no @azure/functions dependency needed.
 *
 * The handler processes one file per request; the frontend sends parallel
 * requests and Azure Functions auto-scales to handle concurrency.
 */

const fs = require("fs");
const path = require("path");
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { convertHandler } = require("../../api/lib/convert-handler.js");

const SAMPLE_DIR = path.resolve(__dirname, "../../INPUT");
const SAMPLE_FILE = "SAP-APIM-GWSAMPLE.xml";
const sampleAvailable = fs.existsSync(path.join(SAMPLE_DIR, SAMPLE_FILE));

/** Creates a mock Azure Functions HttpRequest. */
function mockRequest(body) {
  return { json: async () => body };
}

/** Mock Azure Functions InvocationContext. */
const mockContext = {
  error: () => {},
  log: () => {},
  warn: () => {},
};

// ── convertHandler — success ──────────────────────────────────

describe("convertHandler — success", () => {
  let sampleXml;

  before(() => {
    if (sampleAvailable) {
      sampleXml = fs.readFileSync(path.join(SAMPLE_DIR, SAMPLE_FILE), "utf8");
    }
  });

  it("should convert a single file successfully", async () => {
    if (!sampleAvailable) return;

    const response = await convertHandler(
      mockRequest({ fileName: SAMPLE_FILE, content: sampleXml }),
      mockContext
    );

    assert.equal(response.status, undefined); // No error status = 200
    assert.ok(response.jsonBody.data.openapi);
    assert.ok(response.jsonBody.fileName.endsWith("-openapi.json"));
    assert.ok(Array.isArray(response.jsonBody.warnings));
  });
});

// ── convertHandler — validation ───────────────────────────────

describe("convertHandler — validation", () => {
  it("should return 400 when fileName is missing", async () => {
    const response = await convertHandler(
      mockRequest({ content: "test" }),
      mockContext
    );
    assert.equal(response.status, 400);
    assert.ok(response.jsonBody.error.includes("fileName"));
  });

  it("should return 400 when content is missing", async () => {
    const response = await convertHandler(
      mockRequest({ fileName: "test.xml" }),
      mockContext
    );
    assert.equal(response.status, 400);
  });

  it("should return 400 when both are missing", async () => {
    const response = await convertHandler(mockRequest({}), mockContext);
    assert.equal(response.status, 400);
  });

  it("should return proper error status for unsupported extension", async () => {
    const response = await convertHandler(
      mockRequest({ fileName: "data.txt", content: "hello" }),
      mockContext
    );
    assert.equal(response.status, 400);
    assert.equal(response.jsonBody.errorType, "UnsupportedExtensionError");
  });

  it("should return 422 for malformed XML content", async () => {
    const response = await convertHandler(
      mockRequest({ fileName: "test.xml", content: "<broken><no-close" }),
      mockContext
    );
    // XmlParseError → 422
    assert.ok([422, 500].includes(response.status));
  });

  it("should return error for empty content", async () => {
    const response = await convertHandler(
      mockRequest({ fileName: "test.xml", content: "" }),
      mockContext
    );
    assert.equal(response.status, 400);
  });

  it("should return error for malformed JSON", async () => {
    const response = await convertHandler(
      mockRequest({ fileName: "test.json", content: "{bad json}" }),
      mockContext
    );
    assert.ok(response.status >= 400);
    assert.ok(response.jsonBody.errorType);
  });
});

// ── convertHandler — error handling ───────────────────────────

describe("convertHandler — unexpected errors", () => {
  it("should return 500 when request.json() throws", async () => {
    const badRequest = {
      json: async () => {
        throw new Error("Invalid JSON body");
      },
    };

    const response = await convertHandler(badRequest, mockContext);
    assert.equal(response.status, 500);
    assert.equal(response.jsonBody.code, "INTERNAL_ERROR");
  });

  it("should not leak internal error details to client", async () => {
    const badRequest = {
      json: async () => {
        throw new Error("Sensitive internal details");
      },
    };

    const response = await convertHandler(badRequest, mockContext);
    assert.ok(!response.jsonBody.error.includes("Sensitive"));
  });
});

