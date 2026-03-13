// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for api/lib/errors.js
 * Verifies error names, codes, and properties for all custom error classes.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  UnsupportedExtensionError,
  InvalidContentError,
  XmlParseError,
  JsonParseError,
  CsdlParseError,
  OpenApiConversionError,
  PostProcessingError,
  FileIOError,
} = require("../../api/lib/errors.js");
const { ERROR_CODE } = require("../../api/lib/constants.js");

describe("UnsupportedExtensionError", () => {
  it("should be an instance of Error", () => {
    const err = new UnsupportedExtensionError(".txt");
    assert.ok(err instanceof Error);
  });

  it("should set name, code, and extension", () => {
    const err = new UnsupportedExtensionError(".csv");
    assert.equal(err.name, "UnsupportedExtensionError");
    assert.equal(err.code, ERROR_CODE.UNSUPPORTED_EXTENSION);
    assert.equal(err.extension, ".csv");
  });

  it("should include unsupported extension in message", () => {
    const err = new UnsupportedExtensionError(".yaml");
    assert.ok(err.message.includes(".yaml"));
  });

  it("should list supported extensions in message", () => {
    const err = new UnsupportedExtensionError(".txt");
    assert.ok(err.message.includes(".xml"));
    assert.ok(err.message.includes(".edmx"));
    assert.ok(err.message.includes(".json"));
  });
});

describe("InvalidContentError", () => {
  it("should set name and code", () => {
    const err = new InvalidContentError("file is empty");
    assert.equal(err.name, "InvalidContentError");
    assert.equal(err.code, ERROR_CODE.INVALID_CONTENT);
  });

  it("should include detail in message", () => {
    const err = new InvalidContentError("whitespace only");
    assert.ok(err.message.includes("whitespace only"));
  });
});

describe("XmlParseError", () => {
  it("should set name, code, and cause", () => {
    const cause = new Error("unclosed tag");
    const err = new XmlParseError("unclosed <root>", cause);
    assert.equal(err.name, "XmlParseError");
    assert.equal(err.code, ERROR_CODE.MALFORMED_XML);
    assert.equal(err.cause, cause);
  });

  it("should extract line/column from cause.parser when available", () => {
    const cause = { parser: { line: 5, column: 10, construct: "tag" } };
    const err = new XmlParseError("bad tag", cause);
    assert.equal(err.line, 5);
    assert.equal(err.column, 10);
    assert.equal(err.construct, "tag");
  });

  it("should handle cause without parser info", () => {
    const err = new XmlParseError("generic error", new Error("oops"));
    assert.equal(err.line, undefined);
    assert.equal(err.column, undefined);
  });
});

describe("JsonParseError", () => {
  it("should set name, code, and cause", () => {
    const cause = new Error("unexpected token");
    const err = new JsonParseError("invalid syntax", cause);
    assert.equal(err.name, "JsonParseError");
    assert.equal(err.code, ERROR_CODE.MALFORMED_JSON);
    assert.equal(err.cause, cause);
  });
});

describe("CsdlParseError", () => {
  it("should set name, code, and validation messages", () => {
    const msgs = ["warning 1", "warning 2"];
    const err = new CsdlParseError("unexpected root", null, msgs);
    assert.equal(err.name, "CsdlParseError");
    assert.equal(err.code, ERROR_CODE.INVALID_CSDL);
    assert.deepEqual(err.validationMessages, msgs);
  });

  it("should default validationMessages to empty array", () => {
    const err = new CsdlParseError("bad structure");
    assert.deepEqual(err.validationMessages, []);
  });

  it("should extract line/column from cause.parser", () => {
    const cause = { parser: { line: 3, column: 7, construct: "attr" } };
    const err = new CsdlParseError("missing attr", cause, []);
    assert.equal(err.line, 3);
    assert.equal(err.column, 7);
  });
});

describe("OpenApiConversionError", () => {
  it("should set name, code, and messages", () => {
    const msgs = ["invalid target"];
    const err = new OpenApiConversionError("conversion failed", null, msgs);
    assert.equal(err.name, "OpenApiConversionError");
    assert.equal(err.code, ERROR_CODE.INTERNAL_ERROR);
    assert.deepEqual(err.validationMessages, msgs);
  });

  it("should preserve cause", () => {
    const cause = new Error("root cause");
    const err = new OpenApiConversionError("failed", cause, []);
    assert.equal(err.cause, cause);
  });
});

describe("PostProcessingError", () => {
  it("should set name, code, and cause", () => {
    const cause = new Error("deep-copy failed");
    const err = new PostProcessingError("addPutMethods blew up", cause);
    assert.equal(err.name, "PostProcessingError");
    assert.equal(err.code, ERROR_CODE.INTERNAL_ERROR);
    assert.equal(err.cause, cause);
  });
});

describe("FileIOError", () => {
  it("should set name, code, and systemCode", () => {
    const cause = Object.assign(new Error("no such file"), { code: "ENOENT" });
    const err = new FileIOError("cannot read /foo", cause);
    assert.equal(err.name, "FileIOError");
    assert.equal(err.code, ERROR_CODE.IO_ERROR);
    assert.equal(err.systemCode, "ENOENT");
    assert.equal(err.cause, cause);
  });

  it("should handle EACCES system code", () => {
    const cause = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const err = new FileIOError("cannot write", cause);
    assert.equal(err.systemCode, "EACCES");
  });

  it("should set systemCode to null when cause has no code", () => {
    const err = new FileIOError("disk error", new Error("generic"));
    assert.equal(err.systemCode, null);
  });

  it("should handle null cause", () => {
    const err = new FileIOError("unknown I/O error", null);
    assert.equal(err.systemCode, null);
    assert.equal(err.cause, null);
  });
});
