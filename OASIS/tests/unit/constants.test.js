// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for api/lib/constants.js
 * Verifies derived constants, freezing, and consistency.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  FORMATS,
  FORMAT,
  SUPPORTED_EXTENSIONS,
  INPUT_EXTENSION_RE,
  OPENAPI_OUTPUT_SUFFIX,
  BOM,
  HTTP_STATUS_MAP,
  ERROR_CODE,
} = require("../../api/lib/constants.js");

// ── FORMATS ────────────────────────────────────────────────────

describe("FORMATS", () => {
  it("should be frozen", () => {
    assert.ok(Object.isFrozen(FORMATS));
  });

  it("should contain xml, edmx, and json", () => {
    assert.ok(FORMATS.xml);
    assert.ok(FORMATS.edmx);
    assert.ok(FORMATS.json);
  });

  it("should map each format to its extension", () => {
    assert.equal(FORMATS.xml.ext, ".xml");
    assert.equal(FORMATS.edmx.ext, ".edmx");
    assert.equal(FORMATS.json.ext, ".json");
  });
});

// ── FORMAT enum ────────────────────────────────────────────────

describe("FORMAT", () => {
  it("should be frozen", () => {
    assert.ok(Object.isFrozen(FORMAT));
  });

  it("should have uppercase keys mapping to lowercase values", () => {
    assert.equal(FORMAT.XML, "xml");
    assert.equal(FORMAT.EDMX, "edmx");
    assert.equal(FORMAT.JSON, "json");
  });

  it("should have the same number of entries as FORMATS", () => {
    assert.equal(Object.keys(FORMAT).length, Object.keys(FORMATS).length);
  });
});

// ── SUPPORTED_EXTENSIONS ───────────────────────────────────────

describe("SUPPORTED_EXTENSIONS", () => {
  it("should be derived from FORMATS (same count)", () => {
    assert.equal(SUPPORTED_EXTENSIONS.length, Object.keys(FORMATS).length);
  });

  it("should contain .xml, .edmx, .json", () => {
    assert.ok(SUPPORTED_EXTENSIONS.includes(".xml"));
    assert.ok(SUPPORTED_EXTENSIONS.includes(".edmx"));
    assert.ok(SUPPORTED_EXTENSIONS.includes(".json"));
  });

  it("should match the extensions defined in FORMATS", () => {
    for (const key of Object.keys(FORMATS)) {
      assert.ok(
        SUPPORTED_EXTENSIONS.includes(FORMATS[key].ext),
        `Missing ${FORMATS[key].ext}`
      );
    }
  });
});

// ── INPUT_EXTENSION_RE ─────────────────────────────────────────

describe("INPUT_EXTENSION_RE", () => {
  it("should match .xml extension", () => {
    assert.ok(INPUT_EXTENSION_RE.test("file.xml"));
  });

  it("should match .edmx extension", () => {
    assert.ok(INPUT_EXTENSION_RE.test("file.edmx"));
  });

  it("should match .json extension", () => {
    assert.ok(INPUT_EXTENSION_RE.test("file.json"));
  });

  it("should be case-insensitive", () => {
    assert.ok(INPUT_EXTENSION_RE.test("FILE.XML"));
    assert.ok(INPUT_EXTENSION_RE.test("DATA.EDMX"));
    assert.ok(INPUT_EXTENSION_RE.test("spec.JSON"));
  });

  it("should not match unsupported extensions", () => {
    assert.equal(INPUT_EXTENSION_RE.test("file.txt"), false);
    assert.equal(INPUT_EXTENSION_RE.test("file.yaml"), false);
    assert.equal(INPUT_EXTENSION_RE.test("file.csv"), false);
  });

  it("should match at end of string only", () => {
    // The regex should anchor to the end — "file.xml.bak" should not match
    // Actually INPUT_EXTENSION_RE uses $ anchor, so let's verify
    assert.equal(INPUT_EXTENSION_RE.test("file.xml.bak"), false);
  });

  it("should work with String.replace for output naming", () => {
    const result = "service.xml".replace(INPUT_EXTENSION_RE, "-openapi.json");
    assert.equal(result, "service-openapi.json");
  });
});

// ── OPENAPI_OUTPUT_SUFFIX ──────────────────────────────────────

describe("OPENAPI_OUTPUT_SUFFIX", () => {
  it("should be '-openapi.json'", () => {
    assert.equal(OPENAPI_OUTPUT_SUFFIX, "-openapi.json");
  });
});

// ── BOM ────────────────────────────────────────────────────────

describe("BOM", () => {
  it("should be the Unicode BOM character U+FEFF", () => {
    assert.equal(BOM, "\uFEFF");
    assert.equal(BOM.charCodeAt(0), 0xfeff);
  });
});

// ── HTTP_STATUS_MAP ────────────────────────────────────────────

describe("HTTP_STATUS_MAP", () => {
  it("should be frozen", () => {
    assert.ok(Object.isFrozen(HTTP_STATUS_MAP));
  });

  it("should map client errors to 4xx", () => {
    assert.equal(HTTP_STATUS_MAP.InvalidContentError, 400);
    assert.equal(HTTP_STATUS_MAP.UnsupportedExtensionError, 400);
    assert.equal(HTTP_STATUS_MAP.XmlParseError, 422);
    assert.equal(HTTP_STATUS_MAP.JsonParseError, 422);
    assert.equal(HTTP_STATUS_MAP.CsdlParseError, 422);
  });

  it("should map server errors to 5xx", () => {
    assert.equal(HTTP_STATUS_MAP.OpenApiConversionError, 500);
    assert.equal(HTTP_STATUS_MAP.PostProcessingError, 500);
  });

  it("should not include FileIOError (CLI-only, never reaches API)", () => {
    assert.equal(HTTP_STATUS_MAP.FileIOError, undefined);
  });
});

// ── ERROR_CODE ─────────────────────────────────────────────────

describe("ERROR_CODE", () => {
  it("should be frozen", () => {
    assert.ok(Object.isFrozen(ERROR_CODE));
  });

  it("should have stable machine-readable string values", () => {
    assert.equal(ERROR_CODE.INVALID_CONTENT, "INVALID_CONTENT");
    assert.equal(ERROR_CODE.UNSUPPORTED_EXTENSION, "UNSUPPORTED_EXTENSION");
    assert.equal(ERROR_CODE.MALFORMED_XML, "MALFORMED_XML");
    assert.equal(ERROR_CODE.MALFORMED_JSON, "MALFORMED_JSON");
    assert.equal(ERROR_CODE.INVALID_CSDL, "INVALID_CSDL");
    assert.equal(ERROR_CODE.IO_ERROR, "IO_ERROR");
    assert.equal(ERROR_CODE.INTERNAL_ERROR, "INTERNAL_ERROR");
  });

  it("should have a corresponding HTTP_STATUS_MAP entry for each API-facing error class", () => {
    // FileIOError is CLI-only and intentionally excluded from HTTP_STATUS_MAP
    const errorNames = [
      "InvalidContentError",
      "UnsupportedExtensionError",
      "XmlParseError",
      "JsonParseError",
      "CsdlParseError",
      "OpenApiConversionError",
      "PostProcessingError",
    ];
    for (const name of errorNames) {
      assert.ok(
        HTTP_STATUS_MAP[name] !== undefined,
        `${name} should have an HTTP status mapping`
      );
    }
  });
});
