// Copyright (c) Microsoft Corporation. Licensed under the MIT license.

/**
 * Unit tests for api/lib/validation.js
 * Covers: detectFormat, isSupportedFile, validateExtension, parseXml, parseJson
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  detectFormat,
  isSupportedFile,
  validateExtension,
  parseXml,
  parseJson,
} = require("../../api/lib/validation.js");

// ── detectFormat ───────────────────────────────────────────────

describe("detectFormat", () => {
  it("should detect XML for content starting with '<'", () => {
    assert.equal(detectFormat("<root><child/></root>"), "xml");
  });

  it("should detect XML for content with XML declaration", () => {
    const xml = '<?xml version="1.0" encoding="utf-8"?><root/>';
    assert.equal(detectFormat(xml), "xml");
  });

  it("should detect JSON for valid JSON object", () => {
    assert.equal(detectFormat('{"$Version": "4.0"}'), "json");
  });

  it("should detect JSON for valid JSON array", () => {
    assert.equal(detectFormat("[1, 2, 3]"), "json");
  });

  it("should strip BOM before detection", () => {
    assert.equal(detectFormat('\uFEFF{"key": "value"}'), "json");
  });

  it("should strip leading whitespace before detection", () => {
    assert.equal(detectFormat("   <root/>"), "xml");
  });

  it("should throw InvalidContentError for null", () => {
    assert.throws(
      () => detectFormat(null),
      (err) => err.name === "InvalidContentError" && err.code === "INVALID_CONTENT"
    );
  });

  it("should throw InvalidContentError for undefined", () => {
    assert.throws(
      () => detectFormat(undefined),
      (err) => err.name === "InvalidContentError"
    );
  });

  it("should throw InvalidContentError for empty string", () => {
    assert.throws(
      () => detectFormat(""),
      (err) => err.name === "InvalidContentError"
    );
  });

  it("should throw InvalidContentError for whitespace-only string", () => {
    assert.throws(
      () => detectFormat("   \n\t  "),
      (err) => err.name === "InvalidContentError"
    );
  });

  it("should throw InvalidContentError for non-string input", () => {
    assert.throws(
      () => detectFormat(42),
      (err) => err.name === "InvalidContentError"
    );
  });

  it("should throw InvalidContentError for unrecognizable content", () => {
    assert.throws(
      () => detectFormat("hello world"),
      (err) => err.name === "InvalidContentError"
    );
  });

  it("should throw JsonParseError for malformed JSON starting with '{'", () => {
    assert.throws(
      () => detectFormat("{bad json}"),
      (err) => err.name === "JsonParseError" && err.code === "MALFORMED_JSON"
    );
  });

  it("should throw JsonParseError for malformed JSON starting with '['", () => {
    assert.throws(
      () => detectFormat("[bad, array"),
      (err) => err.name === "JsonParseError"
    );
  });

  it("should throw XmlParseError for malformed XML", () => {
    assert.throws(
      () => detectFormat("<unclosed"),
      (err) => err.name === "XmlParseError" && err.code === "MALFORMED_XML"
    );
  });

  it("should throw XmlParseError for mismatched XML tags", () => {
    assert.throws(
      () => detectFormat("<open></close>"),
      (err) => err.name === "XmlParseError"
    );
  });
});

// ── isSupportedFile ────────────────────────────────────────────

describe("isSupportedFile", () => {
  it("should return true for .xml files", () => {
    assert.equal(isSupportedFile("service.xml"), true);
  });

  it("should return true for .edmx files", () => {
    assert.equal(isSupportedFile("metadata.edmx"), true);
  });

  it("should return true for .json files", () => {
    assert.equal(isSupportedFile("csdl.json"), true);
  });

  it("should be case-insensitive", () => {
    assert.equal(isSupportedFile("SERVICE.XML"), true);
    assert.equal(isSupportedFile("Metadata.EDMX"), true);
    assert.equal(isSupportedFile("data.JSON"), true);
  });

  it("should return false for .txt files", () => {
    assert.equal(isSupportedFile("readme.txt"), false);
  });

  it("should return false for .yaml files", () => {
    assert.equal(isSupportedFile("spec.yaml"), false);
  });

  it("should return false for files without extension", () => {
    assert.equal(isSupportedFile("Makefile"), false);
  });

  it("should return false for dot-only filenames", () => {
    assert.equal(isSupportedFile(".gitignore"), false);
  });
});

// ── validateExtension ──────────────────────────────────────────

describe("validateExtension", () => {
  it("should not throw for .xml", () => {
    assert.doesNotThrow(() => validateExtension("file.xml"));
  });

  it("should not throw for .edmx", () => {
    assert.doesNotThrow(() => validateExtension("file.edmx"));
  });

  it("should not throw for .json", () => {
    assert.doesNotThrow(() => validateExtension("file.json"));
  });

  it("should not throw for uppercase extensions", () => {
    assert.doesNotThrow(() => validateExtension("FILE.XML"));
  });

  it("should throw UnsupportedExtensionError for .txt", () => {
    assert.throws(
      () => validateExtension("file.txt"),
      (err) => {
        return (
          err.name === "UnsupportedExtensionError" &&
          err.code === "UNSUPPORTED_EXTENSION" &&
          err.extension === ".txt"
        );
      }
    );
  });

  it("should throw UnsupportedExtensionError for no extension", () => {
    assert.throws(
      () => validateExtension("noext"),
      (err) => {
        return (
          err.name === "UnsupportedExtensionError" &&
          err.extension === "(no extension)"
        );
      }
    );
  });

  it("should include supported extensions in error message", () => {
    assert.throws(
      () => validateExtension("file.csv"),
      (err) => err.message.includes(".xml") && err.message.includes(".edmx")
    );
  });
});

// ── parseXml ───────────────────────────────────────────────────

describe("parseXml", () => {
  it("should parse minimal valid OData V2 EDMX", () => {
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">',
      '  <edmx:DataServices m:DataServiceVersion="2.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">',
      '    <Schema Namespace="Test" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">',
      '      <EntityType Name="Item">',
      '        <Key><PropertyRef Name="ID"/></Key>',
      '        <Property Name="ID" Type="Edm.Int32" Nullable="false"/>',
      "      </EntityType>",
      "    </Schema>",
      "  </edmx:DataServices>",
      "</edmx:Edmx>",
    ].join("\n");

    const { csdl, messages } = parseXml(xml);
    assert.ok(csdl, "Should return a CSDL object");
    assert.ok(typeof csdl === "object");
    assert.ok(Array.isArray(messages), "Should return messages array");
  });

  it("should collect validation messages without throwing", () => {
    // Valid XML structure but with elements that produce warnings
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">',
      '  <edmx:DataServices m:DataServiceVersion="2.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">',
      '    <Schema Namespace="Warn" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">',
      '      <EntityType Name="W">',
      '        <Key><PropertyRef Name="ID"/></Key>',
      '        <Property Name="ID" Type="Edm.Int32" Nullable="false"/>',
      "      </EntityType>",
      "    </Schema>",
      "  </edmx:DataServices>",
      "</edmx:Edmx>",
    ].join("\n");

    const { csdl, messages } = parseXml(xml);
    assert.ok(csdl);
    assert.ok(Array.isArray(messages));
  });
});

// ── parseJson ──────────────────────────────────────────────────

describe("parseJson", () => {
  it("should parse valid JSON CSDL object", () => {
    const json = '{"$Version": "4.0", "TestNS": {}}';
    const { csdl } = parseJson(json);
    assert.ok(csdl);
    assert.equal(csdl["$Version"], "4.0");
  });

  it("should parse JSON with nested structures", () => {
    const json = JSON.stringify({
      "$Version": "4.0",
      "NS": {
        "Entity": {
          "$Kind": "EntityType",
          "$Key": ["ID"],
          "ID": { "$Type": "Edm.Int32" },
        },
      },
    });
    const { csdl } = parseJson(json);
    assert.ok(csdl.NS);
    assert.ok(csdl.NS.Entity);
  });

  it("should throw JsonParseError for invalid JSON syntax", () => {
    assert.throws(
      () => parseJson("{bad}"),
      (err) => err.name === "JsonParseError" && err.code === "MALFORMED_JSON"
    );
  });

  it("should throw JsonParseError for empty string", () => {
    assert.throws(
      () => parseJson(""),
      (err) => err.name === "JsonParseError"
    );
  });

  it("should throw CsdlParseError for JSON null", () => {
    assert.throws(
      () => parseJson("null"),
      (err) => err.name === "CsdlParseError" && err.code === "INVALID_CSDL"
    );
  });

  it("should throw CsdlParseError for JSON array", () => {
    assert.throws(
      () => parseJson("[1,2,3]"),
      (err) => err.name === "CsdlParseError"
    );
  });

  it("should throw CsdlParseError for JSON boolean", () => {
    assert.throws(
      () => parseJson("true"),
      (err) => err.name === "CsdlParseError"
    );
  });

  it("should throw CsdlParseError for JSON number", () => {
    assert.throws(
      () => parseJson("42"),
      (err) => err.name === "CsdlParseError"
    );
  });
});
